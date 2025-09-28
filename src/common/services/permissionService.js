const { systemPreferences, shell, desktopCapturer } = require('electron');
const permissionRepository = require('../repositories/permission');
const { createLogger } = require('./logger.js');

const logger = createLogger('PermissionService');

class PermissionService {
  async checkSystemPermissions() {
    const permissions = {
      microphone: 'unknown',
      screen: 'unknown',
      needsSetup: true
    };

    try {
      if (process.platform === 'darwin') {
        const micStatus = systemPreferences.getMediaAccessStatus('microphone');
        logger.info('[Permissions] Microphone status:', micStatus);
        permissions.microphone = micStatus;

        const screenStatus = systemPreferences.getMediaAccessStatus('screen');
        logger.info('[Permissions] Screen status:', screenStatus);
        permissions.screen = screenStatus;

        permissions.needsSetup = micStatus !== 'granted' || screenStatus !== 'granted';
      } else {
        permissions.microphone = 'granted';
        permissions.screen = 'granted';
        permissions.needsSetup = false;
      }

      logger.info('[Permissions] System permissions status:', permissions);
      return permissions;
    } catch (error) {
      logger.error('Error checking permissions:', { error });
      return {
        microphone: 'unknown',
        screen: 'unknown',
        needsSetup: true,
        error: error.message
      };
    }
  }

  async requestMicrophonePermission() {
    if (process.platform !== 'darwin') {
      return { success: true };
    }

    try {
      const status = systemPreferences.getMediaAccessStatus('microphone');
      logger.info('[Permissions] Microphone status:', status);
      if (status === 'granted') {
        return { success: true, status: 'granted' };
      }

      const granted = await systemPreferences.askForMediaAccess('microphone');
      return {
        success: granted,
        status: granted ? 'granted' : 'denied'
      };
    } catch (error) {
      logger.error('Error requesting microphone permission:', { error });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async openSystemPreferences(section) {
    if (process.platform !== 'darwin') {
      return { success: false, error: 'Not supported on this platform' };
    }

    try {
      if (section === 'screen-recording') {
        try {
          logger.info('[Permissions] Triggering screen capture request to register app...');
          await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 1, height: 1 }
          });
          logger.info('[Permissions] App registered for screen recording');
        } catch (captureError) {
          logger.info('[Permissions] Screen capture request triggered (expected to fail):', captureError.message);
        }
        
        // await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      }
      return { success: true };
    } catch (error) {
      logger.error('Error opening system preferences:', { error });
      return { success: false, error: error.message };
    }
  }

  async markPermissionsAsCompleted() {
    try {
      await permissionRepository.markPermissionsAsCompleted();
      logger.info('[Permissions] Marked permissions as completed');
      return { success: true };
    } catch (error) {
      logger.error('Error marking permissions as completed:', { error });
      return { success: false, error: error.message };
    }
  }

  async checkPermissionsCompleted() {
    try {
      const completed = await permissionRepository.checkPermissionsCompleted();
      logger.info('[Permissions] Permissions completed status:', completed);
      return completed;
    } catch (error) {
      logger.error('Error checking permissions completed status:', { error });
      return false;
    }
  }
}

const permissionService = new PermissionService();
module.exports = permissionService; 