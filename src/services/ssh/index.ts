// src/services/ssh/index.ts
import { SSHMetricsService } from './ssh-metrics-service';
import { SSHTerminalService } from './ssh-terminal-service';

// Re-export the SSH services for easy importing
export { connectionPool } from './ssh-connection-pool';
export { SSHTerminalService } from './ssh-terminal-service';
export { SSHMetricsService } from './ssh-metrics-service';

// Initialize function for application startup
// export const initializeSSHServices = (): void => {
//   // Start the metrics collection service
//   SSHMetricsService.startMetricsService();
// };

// Shutdown function for application termination
export const shutdownSSHServices = (): Promise<void> => {
  return new Promise<void>((resolve) => {
    // Shutdown the SSH services (this calls connection pool shutdown internally)
    SSHTerminalService.shutdown();
    resolve();
  });
};