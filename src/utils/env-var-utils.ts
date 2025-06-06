import { EnvVarConfig } from '../config';

type JsonValue = string | number | boolean | null | undefined | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

/**
 * Combines global and server-specific environment variables
 * Server-specific variables take precedence over global variables with the same name
 */
export function combineEnvVars(
  globalEnvVars: EnvVarConfig[] | undefined,
  serverEnvVars: EnvVarConfig[] | undefined
): EnvVarConfig[] {
  const combinedEnvVars: EnvVarConfig[] = [];

  // Add global environment variables
  if (globalEnvVars?.length) {
    combinedEnvVars.push(...globalEnvVars);
  }

  // Add server-specific environment variables, which take precedence over global ones
  if (serverEnvVars?.length) {
    // For each server-specific var, remove any global var with the same name
    const serverVarNames = new Set(serverEnvVars.map((v) => v.name));
    const filteredGlobalVars = combinedEnvVars.filter((v) => !serverVarNames.has(v.name));

    // Replace combinedEnvVars with filtered globals + server vars
    combinedEnvVars.length = 0;
    combinedEnvVars.push(...filteredGlobalVars, ...serverEnvVars);
  }

  return combinedEnvVars;
}

/**
 * Recursively expands environment variables in an object based on configuration
 */
export function expandEnvVars(
  obj: JsonValue,
  envVarConfigs: EnvVarConfig[] | undefined
): JsonValue {
  if (!envVarConfigs || envVarConfigs.length === 0 || !obj) {
    return obj;
  }

  if (typeof obj === 'string') {
    return expandEnvVarsInString(obj, envVarConfigs);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => expandEnvVars(item, envVarConfigs));
  }

  if (typeof obj === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandEnvVars(value, envVarConfigs);
    }
    return result;
  }

  return obj;
}

/**
 * Expands environment variables in a string based on configuration
 */
function expandEnvVarsInString(str: string, envVarConfigs: EnvVarConfig[]): string {
  let result = str;

  for (const config of envVarConfigs) {
    if (config.expand) {
      const envVarName = config.name;
      const envVarValue = config.value;

      // Using double backslash to escape the $ and properly escape the curly braces
      const regex = new RegExp(`\\$\\{${envVarName}\\}`, 'g');
      result = result.replace(regex, envVarValue);
    }
  }

  return result;
}

/**
 * Recursively unexpands (replaces values with environment variable references) in an object
 */
export function unexpandEnvVars(
  obj: JsonValue,
  envVarConfigs: EnvVarConfig[] | undefined
): JsonValue {
  if (!envVarConfigs || envVarConfigs.length === 0 || !obj) {
    return obj;
  }

  if (typeof obj === 'string') {
    return unexpandEnvVarsInString(obj, envVarConfigs);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => unexpandEnvVars(item, envVarConfigs));
  }

  if (typeof obj === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = unexpandEnvVars(value, envVarConfigs);
    }
    return result;
  }

  return obj;
}

/**
 * Replaces values with environment variable references in a string
 */
function unexpandEnvVarsInString(str: string, envVarConfigs: EnvVarConfig[]): string {
  let result = str;

  for (const config of envVarConfigs) {
    if (config.unexpand) {
      const envVarName = config.name;
      const envVarValue = config.value;

      if (result.includes(envVarValue)) {
        result = result.replace(new RegExp(envVarValue, 'g'), `\${${envVarName}}`);
      }
    }
  }

  return result;
}
