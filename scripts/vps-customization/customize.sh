#!/bin/bash
# Servox VPS Customization Script
# This script rebrands a Contabo VPS to Servox branding

set -e
echo "Starting Servox VPS customization..."

# Create necessary directories
mkdir -p /opt/servox/welcome
mkdir -p /opt/servox/tools
mkdir -p /opt/servox/docs

# Extract branding assets
tar -xzf /tmp/branding.tar.gz -C /opt/servox/

# Remove any Contabo branding
echo "Removing original provider branding..."
find_and_replace() {
    grep -rl "contabo" $1 2>/dev/null | xargs -r sed -i 's/[Cc]ontabo/Servox/g'
    grep -rl "CONTABO" $1 2>/dev/null | xargs -r sed -i 's/CONTABO/SERVOX/g'
}

# Check common locations for branding
find_and_replace /etc/
find_and_replace /var/www/html/
find_and_replace /usr/share/

# Update the hostname
NEW_HOSTNAME=$(cat /opt/servox/hostname 2>/dev/null || echo "servox-vps")
hostnamectl set-hostname $NEW_HOSTNAME
echo "127.0.1.1 $NEW_HOSTNAME" >> /etc/hosts

# Set up MOTD (Message of the Day)
# Set up MOTD (Message of the Day)
if [ -d /etc/update-motd.d ]; then
    # Create the MOTD script directly
    cat > /etc/update-motd.d/00-servox-header << 'EOF'
#!/bin/bash
# Servox VPS MOTD (Message of the Day)

# System info
HOSTNAME=$(hostname)
KERNEL=$(uname -r)
CPU_MODEL=$(grep 'model name' /proc/cpuinfo | head -1 | cut -d':' -f2 | sed 's/^ *//')
MEMORY=$(free -h | awk '/^Mem:/ {print $2}')
DISK=$(df -h / | awk 'NR==2 {print $2}')

# Logo with directly embedded color codes
echo -e "\033[0;34m███████ ███████ ██████  ██    ██  ██████  ██   ██ 
██      ██      ██   ██ ██    ██ ██    ██  ██ ██  
███████ █████   ██████  ██    ██ ██    ██   ███   
     ██ ██      ██   ██  ██  ██  ██    ██  ██ ██  
███████ ███████ ██   ██   ████    ██████  ██   ██ \033[0m
                        
\033[1mWelcome to your Servox VPS\033[0m

Host Information:
- Hostname: ${HOSTNAME}
- Kernel:   ${KERNEL}
- CPU:      ${CPU_MODEL}
- Memory:   ${MEMORY}
- Disk:     ${DISK}

\033[0;32mNeed help? Contact us at support@servox.store\033[0m
"
EOF
    chmod +x /etc/update-motd.d/00-servox-header
    
    # Disable default Ubuntu MOTD scripts that might interfere
    if [ -f /etc/update-motd.d/00-header ]; then
        chmod -x /etc/update-motd.d/00-header
    fi
    if [ -f /etc/update-motd.d/10-help-text ]; then
        chmod -x /etc/update-motd.d/10-help-text
    fi
    # You might want to disable other default MOTD scripts as well
    for script in 50-motd-news 80-livepatch 90-updates-available 91-release-upgrade 92-unattended-upgrades; do
        if [ -f /etc/update-motd.d/$script ]; then
            chmod -x /etc/update-motd.d/$script
        fi
    done
else
    # For non-Ubuntu systems (CentOS/RHEL)
    cat > /etc/motd << 'EOF'
[0;34m███████ ███████ ██████  ██    ██  ██████  ██   ██ 
██      ██      ██   ██ ██    ██ ██    ██  ██ ██  
███████ █████   ██████  ██    ██ ██    ██   ███   
     ██ ██      ██   ██  ██  ██  ██    ██  ██ ██  
███████ ███████ ██   ██   ████    ██████  ██   ██ [0m
                        
[1mWelcome to your Servox VPS[0m

[0;32mNeed help? Contact us at support@servox.store[0m
EOF
fi

# Set up SSH banner
cp /tmp/banner /etc/ssh/banner
if ! grep -q "Banner /etc/ssh/banner" /etc/ssh/sshd_config; then
    echo "Banner /etc/ssh/banner" >> /etc/ssh/sshd_config
    systemctl restart sshd
fi

# Install welcome page
cat > /opt/servox/welcome/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Welcome to Your Servox VPS</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        h1 {
            color: #0056b3;
        }
        .logo {
            text-align: center;
            margin-bottom: 30px;
        }
        .info {
            background-color: #f8f9fa;
            border-left: 4px solid #0056b3;
            padding: 15px;
            margin-bottom: 20px;
        }
        .btn {
            display: inline-block;
            background-color: #0056b3;
            color: white;
            padding: 10px 15px;
            text-decoration: none;
            border-radius: 4px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="logo">
        <h1>SERVOX</h1>
        <p>Your High-Performance VPS Provider</p>
    </div>
    
    <div class="info">
        <h2>Your VPS is Ready!</h2>
        <p>Thank you for choosing Servox for your virtual private server needs. Your server has been configured and is ready to use.</p>
    </div>
    
    <h3>Getting Started</h3>
    <p>Here are some helpful resources to get you started with your new VPS:</p>
    <ul>
       
        <li><a href="https://servox.store/" class="btn">Access Your VPS</a></li>
    </ul>
    
    <h3>Server Information</h3>
    <p>For security reasons, specific server information is not displayed here. You can find your server details in your Servox dashboard or in the welcome email.</p>
    
    <footer>
        <p>© 2025 Servox. All rights reserved.</p>
    </footer>
</body>
</html>
EOF

# Copy the welcome page to web server root if it exists
if [ -d /var/www/html ]; then
    cp /opt/servox/welcome/index.html /var/www/html/index.html
fi

# Set up startup script for first boot customization
cat > /etc/rc.local << 'EOF'
#!/bin/bash
# Servox VPS first boot script

if [ ! -f /opt/servox/.setup-complete ]; then
    # Run any first-boot specific customizations here
    
    # Mark setup as complete
    touch /opt/servox/.setup-complete
fi

exit 0
EOF

chmod +x /etc/rc.local

# Create basic system monitoring tool
cat > /opt/servox/tools/system-info.sh << 'EOF'
#!/bin/bash
# Servox System Information Tool

echo "========================="
echo "SERVOX VPS SYSTEM INFO"
echo "========================="
echo
echo "SYSTEM:"
echo "------------------------"
uname -a
echo
echo "CPU USAGE:"
echo "------------------------"
top -bn1 | head -n 5
echo
echo "MEMORY USAGE:"
echo "------------------------"
free -h
echo
echo "DISK USAGE:"
echo "------------------------"
df -h
echo
echo "========================="
echo "For support: support@servox.com"
echo "========================="
EOF

chmod +x /opt/servox/tools/system-info.sh

# Add tools to path for all users
echo 'export PATH=$PATH:/opt/servox/tools' > /etc/profile.d/servox.sh
chmod +x /etc/profile.d/servox.sh

# Clean up
rm -f /tmp/motd /tmp/banner /tmp/branding.tar.gz

echo "Servox VPS customization completed successfully!"