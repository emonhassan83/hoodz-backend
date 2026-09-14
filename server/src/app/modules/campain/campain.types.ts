export type TCampainPayload = {
  title: string;
  titleArabic?: string | null;
  products: string[];
};

export type TUpdateCampainPayload = Partial<TCampainPayload>;
