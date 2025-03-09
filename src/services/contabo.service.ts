import { ContaboAPI } from '../config/contabo.config';
import { logger } from '../utils/logger';
import { NodeSSH } from 'node-ssh';
import * as net from 'net';
import * as fs from 'fs';


interface CustomizationOptions {
  hostname: string;
  brandName?: string;
  userId?: string;
}

export class ContaboVPSService {
  static async performVPSAction(instanceId: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
    try {
        const client = await ContaboAPI.getAuthenticatedClient();
        await client.post(`/compute/instances/202491017/actions/${action}`, {}, {
            headers: {
                'x-request-id': ContaboAPI.generateRequestId()
            }
        });
    } catch (error) {
        logger.error(`VPS ${action} failed for instance ${instanceId}:`, error);
        throw new Error(`Unable to ${action} VPS`);
    }
}

static async getVPSUsage(instanceId: string): Promise<{
    cpu: number;
    memory: number;
    disk: number;
    
}> {
    try {
        const client = await ContaboAPI.getAuthenticatedClient();
        
        // Use the correct endpoint to get instance details with a fresh request ID
        const response = await client.get(`/compute/instances/202491017`, {
            headers: {
                'x-request-id': ContaboAPI.generateRequestId()
            }
        });
        
        // Extract relevant data from the response
        const instanceData = response.data.data[0];
        
        return {
            cpu: instanceData.cpuCores,
            memory: parseInt(instanceData.ramMb, 10) / 1024, // Convert MB to GB
            disk: instanceData.diskMb / 1024, // Convert MB to GB
        
        };
    } catch (error) {
        logger.error(`Failed to retrieve VPS details for instance ${instanceId}:`, error);
        throw new Error('Unable to retrieve VPS details');
    }
}

      
      // Helper function to wait for SSH to be available
      static async waitForSSH(host: string, port: number, timeoutSeconds: number): Promise<boolean> {
        const startTime = Date.now();
        const timeoutMs = timeoutSeconds * 1000;
        
        while (Date.now() - startTime < timeoutMs) {
          try {
            const socket = new net.Socket();
            await new Promise<void>((resolve, reject) => {
              socket.connect(port, host, () => {
                socket.destroy();
                resolve();
              });
              socket.on('error', (err) => {
                socket.destroy();
                reject(err);
              });
            });
            
            logger.info(`SSH available on ${host}:${port}`);
            return true;
          } catch (err) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before trying again
          }
        }
        
        throw new Error(`Timeout waiting for SSH on ${host}:${port}`);
      }

      static async customizeNewInstance(
        instanceId: string | undefined, 
        ipAddress: string, 
        rootPassword: string, 
        customizationOptions: CustomizationOptions
      ): Promise<boolean> {
        let ssh: NodeSSH | null = null;
        
        try {
          logger.info(`Attempting to connect to instance ${instanceId} at ${ipAddress}`);
          
          // Wait for the VPS to be accessible
          try {
            await this.waitForSSH(ipAddress, 22, 300); // Wait up to 5 minutes
          } catch (error) {
            throw new Error(`Instance not accessible via SSH after timeout: ${(error as Error).message}`);
          }
          
          // Use SSH to connect and customize
          ssh = new NodeSSH();
          
          // Connect using password authentication instead of SSH key
          try {
            await ssh.connect({
              host: ipAddress,
              username: 'root', // Using root user
              password: rootPassword, // Using password instead of SSH key
              readyTimeout: 60000, // Increased timeout for connection
              // Add strict host key checking option
              hostVerifier: () => true, // Skip host verification for new instances
              debug: (message: string) => logger.debug(`SSH Debug: ${message}`)
            });
          } catch (error) {
            // More specific error for SSH connection issues
            if ((error as Error).message.includes('All configured authentication methods failed')) {
              throw new Error(`SSH authentication failed. Please verify the username and password are correct.`);
            } else if ((error as Error).message.includes('connect ETIMEDOUT')) {
              throw new Error(`Connection timed out. Please check if the instance is running and security groups allow SSH.`);
            } else if ((error as Error).message.includes('Host does not exist')) {
              throw new Error(`Host not found. Please verify the IP address ${ipAddress} is correct.`);
            }
            throw new Error(`SSH connection error: ${(error as Error).message}`);
          }
          
          logger.info(`Successfully connected to ${ipAddress} via SSH`);
          
          // Create customization directory
          try {
            const mkdirResult = await ssh.execCommand('mkdir -p /tmp/servox-setup');
            if (mkdirResult.code !== 0) {
              throw new Error(`Failed to create setup directory: ${mkdirResult.stderr}`);
            }
          } catch (error) {
            throw new Error(`Failed to create setup directory: ${(error as Error).message}`);
          }
          
          // Upload customization files with error handling
          try {
            logger.info('Uploading customization files...');
            await ssh.putFile('./scripts/vps-customization/customize.sh', '/tmp/servox-setup/customize.sh');
            
            // Handle MOTD files - upload to both temp location and system location
            if (fs.existsSync('./scripts/vps-customization/motd')) {
              // Upload to temporary location for script to use
              await ssh.putFile('./scripts/vps-customization/motd', '/tmp/servox-setup/motd');
              await ssh.putFile('./scripts/vps-customization/motd', '/tmp/motd');
              
              // Also apply directly to system location as a fallback
              try {
                const motdContent = fs.readFileSync('./scripts/vps-customization/motd', 'utf8');
                await ssh.execCommand(`echo "${motdContent}" | tee /etc/motd > /dev/null`);
                logger.info('Applied MOTD directly to /etc/motd');
              } catch (motdError) {
                logger.warn(`Could not directly update /etc/motd: ${(motdError as Error).message}`);
              }
            } else {
              logger.warn('MOTD file not found locally');
            }
            
            // Handle banner files similarly
            if (fs.existsSync('./scripts/vps-customization/banner')) {
              await ssh.putFile('./scripts/vps-customization/banner', '/tmp/servox-setup/banner');
              await ssh.putFile('./scripts/vps-customization/banner', '/tmp/banner');
              
              // Also apply directly to system location as a fallback
              try {
                const bannerContent = fs.readFileSync('./scripts/vps-customization/banner', 'utf8');
                await ssh.execCommand(`echo "${bannerContent}" | tee /etc/ssh/banner > /dev/null`);
                await ssh.execCommand('grep -q "^Banner " /etc/ssh/sshd_config || echo "Banner /etc/ssh/banner" | tee -a /etc/ssh/sshd_config > /dev/null');
                logger.info('Applied banner directly to /etc/ssh/banner');
              } catch (bannerError) {
                logger.warn(`Could not directly update /etc/ssh/banner: ${(bannerError as Error).message}`);
              }
            } else {
              logger.warn('Banner file not found locally');
            }
            
            // Check if branding.tar.gz exists locally and upload it
            const brandingPath = './scripts/vps-customization/branding.tar.gz';
            if (fs.existsSync(brandingPath)) {
              // For macOS tar files, we need to fix the extended attributes issue
              // Create a clean version of the tar without macOS attributes
              if (process.platform === 'darwin') {
                logger.info('Running on macOS, cleaning tar file attributes before upload...');
                try {
                  // Create a temp directory
                  await ssh.execCommand('mkdir -p /tmp/clean-tar');
                  
                  // Upload the original tar file
                  await ssh.putFile(brandingPath, '/tmp/clean-tar/original.tar.gz');
                  
                  // Extract and repack without the macOS attributes
                  await ssh.execCommand('cd /tmp/clean-tar && tar -xzf original.tar.gz && tar -czf /tmp/branding.tar.gz *');
                  
                  logger.info('Successfully cleaned and repacked tar file on the server');
                } catch (tarError) {
                  logger.warn(`Failed to clean tar file: ${(tarError as Error).message}. Uploading original file...`);
                  await ssh.putFile(brandingPath, '/tmp/branding.tar.gz');
                }
              } else {
                await ssh.putFile(brandingPath, '/tmp/branding.tar.gz');
              }
              logger.info('Uploaded branding.tar.gz to /tmp/');
            } else {
              logger.warn('branding.tar.gz not found in local directory. This may cause customization to fail.');
              // Create an empty tar.gz file to prevent script failure
              await ssh.execCommand('touch /tmp/branding.tar.gz');
            }
            
            // Check for other required files based on customize.sh script
            const requiredFiles = [
              { local: './scripts/vps-customization/firewall.conf', remote: '/tmp/servox-setup/firewall.conf' },
              { local: './scripts/vps-customization/sshd_config', remote: '/tmp/servox-setup/sshd_config' }
            ];
            
            for (const file of requiredFiles) {
              if (fs.existsSync(file.local)) {
                await ssh.putFile(file.local, file.remote);
                logger.info(`Uploaded ${file.local} to ${file.remote}`);
              } else {
                logger.warn(`Optional file ${file.local} not found. Skipping.`);
              }
            }
          } catch (error) {
            throw new Error(`Failed to upload customization files: ${(error as Error).message}`);
          }
          
          // Create hostname file with the custom hostname
          try {
            const hostnameResult = await ssh.execCommand(`echo "${customizationOptions.hostname}" > /tmp/servox-setup/hostname`);
            if (hostnameResult.code !== 0) {
              throw new Error(`Failed to create hostname file: ${hostnameResult.stderr}`);
            }
          } catch (error) {
            throw new Error(`Failed to create hostname file: ${(error as Error).message}`);
          }
          
          // Make scripts executable
          try {
            const chmodResult = await ssh.execCommand('chmod +x /tmp/servox-setup/*.sh');
            if (chmodResult.code !== 0) {
              throw new Error(`Failed to make scripts executable: ${chmodResult.stderr}`);
            }
          } catch (error) {
            throw new Error(`Failed to make scripts executable: ${(error as Error).message}`);
          }
          
          // Run the script directly (no sudo needed since we're logged in as root)
          try {
            // First, check if the customization script exists and is executable
            const checkScriptResult = await ssh.execCommand('ls -la /tmp/servox-setup/customize.sh');
            if (checkScriptResult.code !== 0 || checkScriptResult.stdout.trim() === '') {
              throw new Error('Customization script not found or not accessible');
            }
            
            // Verify that critical files exist before running the script
            const checkFileResult = await ssh.execCommand('ls -la /tmp/motd /tmp/branding.tar.gz');
            if (checkFileResult.code !== 0) {
              logger.warn(`Some required files may be missing: ${checkFileResult.stderr}`);
              
              // If motd is missing, let's ensure it's there
              if (checkFileResult.stderr.includes('/tmp/motd')) {
                logger.info('Copying motd file to /tmp/...');
                await ssh.execCommand('cp /tmp/servox-setup/motd /tmp/motd || echo "ServiceX Default MOTD" > /tmp/motd');
              }
            }
            
            // Examine the customize.sh script to understand its file requirements
            const examineScriptResult = await ssh.execCommand('grep -E "cp.*motd|cp.*banner" /tmp/servox-setup/customize.sh');
            logger.info(`Script file operations: ${examineScriptResult.stdout}`);
            
            // Run the customization script with detailed output capture
            logger.info('Running customization script...');
            const result = await ssh.execCommand('cd /tmp/servox-setup && bash -x ./customize.sh', {
              // Add a small timeout to ensure script execution completes
              execOptions: {
                timeout: 180000 // 3 minutes timeout for the customization script
              },
              onStdout: (chunk) => {
                logger.info(`Customization output: ${chunk.toString('utf8').trim()}`);
              },
              onStderr: (chunk) => {
                logger.warn(`Customization error: ${chunk.toString('utf8').trim()}`);
              }
            });
            
            // Even with warnings, we can consider it successful if there are no major errors
            // The tar warnings are just informational and don't affect functionality
            if (result.code !== 0) {
              // Check if the only errors are tar warnings about macOS attributes
              const hasFatalErrors = result.stderr.split('\n').some(line => 
                !line.includes('Ignoring unknown extended header') && 
                line.trim() !== '' &&
                !line.startsWith('+ ') // Ignore bash debug lines
              );
              
              if (hasFatalErrors) {
                logger.error(`Customization script output: ${result.stdout}`);
                logger.error(`Customization script error: ${result.stderr}`);
                throw new Error(`VPS customization failed with exit code ${result.code}: ${result.stderr}`);
              } else {
                logger.warn(`Customization completed with warnings (exit code ${result.code})`);
                logger.warn(`Warnings: ${result.stderr}`);
              }
            }
          } catch (error) {
            if ((error as any).killed) {
              throw new Error('Customization script timed out');
            }
            throw new Error(`Failed to run customization script: ${(error as Error).message}`);
          }
          
          logger.info(`Customization completed for instance ${instanceId} at ${ipAddress}`);
          
          return true;
        } catch (error) {
          const errorMsg = (error as Error).message;
          logger.error(`VPS customization failed for instance ${instanceId}: ${errorMsg}`);
          // Re-throw with instance information
          throw new Error(`Instance ${instanceId} (${ipAddress}) customization failed: ${errorMsg}`);
        } finally {
          // Always clean up SSH connection
          if (ssh) {
            try {
              ssh.dispose();
              logger.debug('SSH connection disposed');
            } catch (disposeError) {
              logger.warn(`Failed to dispose SSH connection: ${(disposeError as Error).message}`);
            }
          }
        }
      }

      
}