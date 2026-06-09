function parseDoctorAccessMap() {
  const rawValue = String(process.env.DOCTOR_ACCESS_ALIASES || '').trim();

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);

    if (!parsedValue || Array.isArray(parsedValue) || typeof parsedValue !== 'object') {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsedValue).map(([doctorCode, aliases]) => [
        String(doctorCode || '').trim(),
        Array.isArray(aliases)
          ? aliases.map((code) => String(code || '').trim()).filter(Boolean)
          : []
      ])
    );
  } catch (error) {
    console.error('Failed to parse DOCTOR_ACCESS_ALIASES:', error);
    return {};
  }
}

export function getAccessibleDoctorCodesByPhpNative(username = '') {
  const normalizedUsername = String(username || '').trim();

  if (!normalizedUsername) {
    return [];
  }

  const configuredMap = parseDoctorAccessMap();
  const mappedCodes = configuredMap[normalizedUsername] || [];

  return [...new Set([normalizedUsername, ...mappedCodes])];
}
