export type ProductCategory = "Apparel" | "Accessories";

export type Product = {
  id: number;
  slug: string;
  name: string;
  category: ProductCategory;
  color: string;
  color_hex: string;
  price: number;
  image_url: string;
  description: string;
  featured: boolean;
  display_order: number;
};

export type ProductsResult =
  { data: Product[]; error: null } | { data: null; error: string };
