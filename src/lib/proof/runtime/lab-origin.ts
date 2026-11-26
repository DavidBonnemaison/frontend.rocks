export const LAB_ORIGIN_PRODUCTION = 'https://frontend-rocks-lab.netlify.app';
export const LAB_ORIGIN_DEV = 'http://127.0.0.1:4174';

const ENV_LAB_ORIGIN =
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_LAB_ORIGIN : undefined;
const IS_PROD = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

export const LAB_ORIGIN: string =
  ENV_LAB_ORIGIN ?? (IS_PROD ? LAB_ORIGIN_PRODUCTION : LAB_ORIGIN_DEV);
