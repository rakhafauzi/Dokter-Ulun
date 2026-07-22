class DiagnosticAccessService {
  static normalizeUsername(value) {
    return String(value || '').trim();
  }

  static parseAccessList(envKey) {
    const rawValue = String(process.env[envKey] || '').trim();

    if (!rawValue) {
      return [];
    }

    if (rawValue.toUpperCase() === 'ALL') {
      return ['ALL'];
    }

    try {
      const parsedValue = JSON.parse(rawValue);
      if (typeof parsedValue === 'string' && parsedValue.toUpperCase() === 'ALL') {
        return ['ALL'];
      }
      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map((item) => this.normalizeUsername(item))
        .map((item) => (item.toUpperCase() === 'ALL' ? 'ALL' : item))
        .filter(Boolean);
    } catch (error) {
      console.error(`Failed to parse ${envKey}:`, error);
      return [];
    }
  }

  static getFeatureConfig(feature) {
    if (feature === 'laboratorium') {
      return {
        envKey: 'DOCTOR_ACCESS_LAB',
        label: 'laboratorium'
      };
    }

    if (feature === 'radiologi') {
      return {
        envKey: 'DOCTOR_ACCESS_RAD',
        label: 'radiologi'
      };
    }

    if (feature === 'echocardiography') {
      return {
        envKey: 'ECHOCARDIO_ACCESS',
        label: 'echocardiography'
      };
    }

    if (feature === 'clinical-pathway') {
      return {
        envKey: 'CLINICAL_PATHWAY_ACCESS',
        label: 'clinical pathway'
      };
    }

    throw new Error(`Fitur akses diagnostik tidak dikenali: ${feature}`);
  }

  static getAllowedUsernames(feature) {
    const config = this.getFeatureConfig(feature);
    return this.parseAccessList(config.envKey);
  }

  static canAccess(feature, username) {
    const normalizedUsername = this.normalizeUsername(username);
    if (!normalizedUsername) {
      return false;
    }

    const allowedUsernames = this.getAllowedUsernames(feature);
    if (allowedUsernames.includes('ALL')) {
      return true;
    }

    return allowedUsernames.includes(normalizedUsername);
  }

  static ensureAccess(feature, username) {
    if (!this.canAccess(feature, username)) {
      const config = this.getFeatureConfig(feature);
      const error = new Error(`Anda tidak memiliki akses ke ${config.label}`);
      error.statusCode = 403;
      throw error;
    }
  }

  static async getAccessInfo(feature, username) {
    return {
      success: true,
      can_access: this.canAccess(feature, username),
      allow_all: this.getAllowedUsernames(feature).includes('ALL'),
      aliases: this.getAllowedUsernames(feature)
    };
  }
}

export default DiagnosticAccessService;
