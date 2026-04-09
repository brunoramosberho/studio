"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, cn } from "@/lib/utils";
import { useBranding } from "@/components/branding-provider";

interface ShopProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  imageUrl: string | null;
  externalUrl: string | null;
}

interface ShopCategory {
  id: string;
  name: string;
  products: ShopProduct[];
}

export default function ShopPage() {
  const { colorAccent } = useBranding();
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);

  const { data: categories = [], isLoading } = useQuery<ShopCategory[]>({
    queryKey: ["shop"],
    queryFn: async () => {
      const res = await fetch("/api/shop");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const allProducts = categories.flatMap((c) => c.products);
  const displayProducts =
    activeCategory === "all"
      ? allProducts
      : categories.find((c) => c.id === activeCategory)?.products ?? [];

  function handleProductClick(product: ShopProduct) {
    if (product.externalUrl) {
      window.open(product.externalUrl, "_blank", "noopener");
    } else {
      setSelectedProduct(product);
    }
  }

  return (
    <div className="min-h-dvh bg-background pb-28">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-foreground">Tienda</h1>
          <p className="text-sm text-muted">Descubre nuestros productos</p>
        </div>

        {/* Category filter */}
        {categories.length > 1 && (
          <div className="mb-6 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setActiveCategory("all")}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all",
                activeCategory === "all"
                  ? "text-white shadow-md"
                  : "bg-surface text-muted hover:text-foreground",
              )}
              style={activeCategory === "all" ? { backgroundColor: colorAccent } : {}}
            >
              Todo
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all",
                  activeCategory === cat.id
                    ? "text-white shadow-md"
                    : "bg-surface text-muted hover:text-foreground",
                )}
                style={activeCategory === cat.id ? { backgroundColor: colorAccent } : {}}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Products grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-square w-full rounded-2xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : displayProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ShoppingBag className="mb-3 h-12 w-12 text-muted/30" />
            <p className="text-sm text-muted">No hay productos disponibles aún</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {displayProducts.map((product, i) => (
                <motion.button
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.03 }}
                  className="group text-left"
                  onClick={() => handleProductClick(product)}
                >
                  <div className="relative overflow-hidden rounded-2xl bg-surface">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center">
                        <ShoppingBag className="h-8 w-8 text-muted/20" />
                      </div>
                    )}
                    {product.externalUrl && (
                      <div className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition group-hover:opacity-100">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                  <div className="mt-2 px-0.5">
                    <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                    <p className="text-sm font-semibold" style={{ color: colorAccent }}>
                      {formatCurrency(product.price, product.currency)}
                    </p>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Product detail overlay (for non-external products) */}
      <AnimatePresence>
        {selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 backdrop-blur-sm sm:items-center"
            onClick={() => setSelectedProduct(null)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              {selectedProduct.imageUrl && (
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.name}
                  className="mb-4 aspect-square w-full rounded-2xl object-cover"
                />
              )}
              <h2 className="font-display text-xl font-bold">{selectedProduct.name}</h2>
              {selectedProduct.description && (
                <p className="mt-1 text-sm text-muted">{selectedProduct.description}</p>
              )}
              <p className="mt-2 text-lg font-bold" style={{ color: colorAccent }}>
                {formatCurrency(selectedProduct.price, selectedProduct.currency)}
              </p>
              <p className="mt-4 text-center text-xs text-muted">
                Consulta en el estudio para adquirir este producto.
              </p>
              <button
                onClick={() => setSelectedProduct(null)}
                className="mt-4 w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: colorAccent }}
              >
                Cerrar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
