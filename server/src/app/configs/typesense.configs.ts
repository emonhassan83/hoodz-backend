import axios, { AxiosError, Method } from 'axios';

import { env } from '@/app/configs/env.configs';

type TTypesenseRequest = {
  method: Method;
  path: string;
  data?: unknown;
  params?: Record<string, unknown>;
};

export class TypesenseHttpError extends Error {
  status?: number;

  constructor(error: AxiosError) {
    super(error.message);
    this.status = error.response?.status;
  }
}

export const isTypesenseEnabled = () =>
  Boolean(env.TYPESENSE_ENABLED && env.TYPESENSE_API_KEY);

export const typesenseRequest = async <T>({
  method,
  path,
  data,
  params,
}: TTypesenseRequest): Promise<T> => {
  if (!isTypesenseEnabled()) {
    throw new Error('Typesense is not enabled');
  }

  try {
    const response = await axios.request<T>({
      method,
      url: `${env.TYPESENSE_PROTOCOL}://${env.TYPESENSE_HOST}:${env.TYPESENSE_PORT}${path}`,
      headers: {
        'X-TYPESENSE-API-KEY': env.TYPESENSE_API_KEY,
      },
      data,
      params,
      timeout: 5000,
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new TypesenseHttpError(error);
    }

    throw error;
  }
};
