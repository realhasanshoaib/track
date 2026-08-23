type ServiceUrlInput = Readonly<{
  isProduction: boolean;
  name: string;
  value: string | undefined;
}>;

export function requireServiceUrl({ isProduction, name, value }: ServiceUrlInput) {
  if (!value) throw new Error(`${name} is required`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials`);
  }
  if (url.protocol !== 'https:' && (!isProduction && url.protocol !== 'http:')) {
    throw new Error(`${name} must use ${isProduction ? 'HTTPS' : 'HTTP or HTTPS'}`);
  }
  if (isProduction && url.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS in production`);
  }

  return value;
}
