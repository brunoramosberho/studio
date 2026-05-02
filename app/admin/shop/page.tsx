"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  ShoppingBag,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  ImagePlus,
  Tag,
  FolderPlus,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatCurrency, cn } from "@/lib/utils";
import { useCurrency } from "@/components/tenant-provider";
import { useTranslations } from "next-intl";

interface Category {
  id: string;
  name: string;
  position: number;
  _count: { products: number };
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  imageUrl: string | null;
  isVisible: boolean;
  isActive: boolean;
  externalUrl: string | null;
  categoryId: string;
  category: { id: string; name: string };
  availableForPreOrder: boolean;
  studioIds: string[];
}

interface StudioOption {
  id: string;
  name: string;
}

function buildEmptyProduct(defaultCurrency: string) {
  return {
    name: "",
    description: "",
    price: "",
    currency: defaultCurrency,
    imageUrl: "",
    isVisible: true,
    externalUrl: "",
    categoryId: "",
    availableForPreOrder: false,
    studioIds: [] as string[],
  };
}

export default function AdminShopPage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const tenantCurrency = useCurrency();
  const fileRef = useRef<HTMLInputElement>(null);

  const emptyProduct = buildEmptyProduct(tenantCurrency.code);

  const [catDialog, setCatDialog] = useState(false);
  const [catName, setCatName] = useState("");
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  const [prodDialog, setProdDialog] = useState(false);
  const [editingProd, setEditingProd] = useState<Product | null>(null);
  const [form, setForm] = useState(() => emptyProduct);
  const [uploading, setUploading] = useState(false);

  const [filterCat, setFilterCat] = useState<string>("all");

  const { data: categories = [], isLoading: catsLoading } = useQuery<Category[]>({
    queryKey: ["admin-shop-categories"],
    queryFn: async () => {
      const res = await fetch("/api/admin/shop/categories");
      if (!res.ok) throw new Error("Failed to load categories");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: products = [], isLoading: prodsLoading } = useQuery<Product[]>({
    queryKey: ["admin-shop-products"],
    queryFn: async () => {
      const res = await fetch("/api/admin/shop/products");
      if (!res.ok) throw new Error("Failed to load products");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: studios = [] } = useQuery<StudioOption[]>({
    queryKey: ["admin-studios-min"],
    queryFn: async () => {
      const res = await fetch("/api/studios");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data)
        ? data.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))
        : [];
    },
  });

  // ── Category mutations ──

  const createCatMut = useMutation({
    mutationFn: (name: string) =>
      fetch("/api/admin/shop/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-shop-categories"] });
      setCatDialog(false);
      setCatName("");
    },
  });

  const updateCatMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      fetch(`/api/admin/shop/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-shop-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-shop-products"] });
      setEditingCat(null);
      setCatName("");
    },
  });

  const deleteCatMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/shop/categories/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-shop-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-shop-products"] });
    },
  });

  // ── Product mutations ──

  const createProdMut = useMutation({
    mutationFn: (data: typeof emptyProduct) =>
      fetch("/api/admin/shop/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, price: Number(data.price) }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-shop-products"] });
      qc.invalidateQueries({ queryKey: ["admin-shop-categories"] });
      closeProdDialog();
    },
  });

  const updateProdMut = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Product>) =>
      fetch(`/api/admin/shop/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-shop-products"] });
      closeProdDialog();
    },
  });

  const deleteProdMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/shop/products/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-shop-products"] });
      qc.invalidateQueries({ queryKey: ["admin-shop-categories"] });
    },
  });

  function openCreateProduct() {
    setEditingProd(null);
    setForm({ ...emptyProduct, categoryId: categories[0]?.id || "" });
    setProdDialog(true);
  }

  function openEditProduct(p: Product) {
    setEditingProd(p);
    setForm({
      name: p.name,
      description: p.description || "",
      price: String(p.price),
      currency: p.currency,
      imageUrl: p.imageUrl || "",
      isVisible: p.isVisible,
      externalUrl: p.externalUrl || "",
      categoryId: p.categoryId,
      availableForPreOrder: p.availableForPreOrder ?? false,
      studioIds: p.studioIds ?? [],
    });
    setProdDialog(true);
  }

  function closeProdDialog() {
    setProdDialog(false);
    setEditingProd(null);
    setForm(emptyProduct);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/shop/upload", { method: "POST", body: fd });
      if (res.ok) {
        const { url } = await res.json();
        setForm((prev) => ({ ...prev, imageUrl: url }));
      }
    } catch {}
    setUploading(false);
  }

  function handleSubmitProduct() {
    if (editingProd) {
      updateProdMut.mutate({
        id: editingProd.id,
        name: form.name,
        description: form.description || null,
        price: Number(form.price),
        currency: form.currency,
        imageUrl: form.imageUrl || null,
        isVisible: form.isVisible,
        externalUrl: form.externalUrl || null,
        categoryId: form.categoryId,
        availableForPreOrder: form.availableForPreOrder,
        studioIds: form.studioIds,
      } as { id: string } & Partial<Product>);
    } else {
      createProdMut.mutate(form);
    }
  }

  const filteredProducts =
    filterCat === "all" ? products : products.filter((p) => p.categoryId === filterCat);

  const isLoading = catsLoading || prodsLoading;
  const saving = createProdMut.isPending || updateProdMut.isPending;

  const totalProducts = products.length;
  const visibleProducts = products.filter((p) => p.isVisible).length;
  const externalProducts = products.filter((p) => p.externalUrl).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">{t("shopTitle")}</h1>
          <p className="mt-1 text-sm text-muted">{t("manageProductsAndCategories")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setCatName("");
              setEditingCat(null);
              setCatDialog(true);
            }}
          >
            <FolderPlus className="mr-1.5 h-4 w-4" />
            {t("category")}
          </Button>
          <Button size="sm" onClick={openCreateProduct} disabled={categories.length === 0}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("product")}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: t("products"), value: totalProducts, icon: ShoppingBag },
          { label: t("visibleToClients"), value: visibleProducts, icon: Eye },
          { label: t("withExternalLink"), value: externalProducts, icon: ExternalLink },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-xl bg-accent/10 p-2.5">
                <s.icon className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{isLoading ? "–" : s.value}</p>
                <p className="text-xs text-muted">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Categories */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Tag className="h-4 w-4 text-admin" />
              {t("categories")}
            </div>
            {catsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : categories.length === 0 ? (
              <p className="text-sm text-muted">
                {t("noCategoriesCreateOne")}
              </p>
            ) : (
              <div className="space-y-2">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between rounded-xl border border-border px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{cat.name}</p>
                      <p className="text-xs text-muted">
                        {t("productCount", { count: cat._count.products })}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditingCat(cat);
                          setCatName(cat.name);
                          setCatDialog(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-500 hover:text-red-600"
                        onClick={() => {
                          if (confirm(t("deleteCategoryConfirm", { name: cat.name }))) {
                            deleteCatMut.mutate(cat.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Products */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShoppingBag className="h-4 w-4 text-admin" />
                {t("products")}
              </div>
              {categories.length > 1 && (
                <div className="flex gap-1">
                  <button
                    onClick={() => setFilterCat("all")}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      filterCat === "all"
                        ? "bg-admin/10 text-admin"
                        : "text-muted hover:bg-surface",
                    )}
                  >
                    {t("allFilter")}
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setFilterCat(cat.id)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        filterCat === cat.id
                          ? "bg-admin/10 text-admin"
                          : "text-muted hover:bg-surface",
                      )}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {prodsLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-64 w-full rounded-xl" />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                {categories.length === 0
                  ? t("createCategoryFirst")
                  : t("noProductsInCategory")}
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProducts.map((prod) => (
                  <div
                    key={prod.id}
                    className={cn(
                      "group relative overflow-hidden rounded-xl border border-border transition-all hover:shadow-md",
                      !prod.isActive && "opacity-50",
                    )}
                  >
                    {prod.imageUrl ? (
                      <div className="relative aspect-square overflow-hidden bg-surface">
                        <img
                          src={prod.imageUrl}
                          alt={prod.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-surface">
                        <ShoppingBag className="h-10 w-10 text-muted/30" />
                      </div>
                    )}

                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{prod.name}</p>
                          <p className="text-xs text-muted">{prod.category.name}</p>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-accent">
                          {formatCurrency(prod.price, prod.currency)}
                        </p>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {!prod.isVisible && (
                          <Badge variant="secondary" className="text-[10px]">
                            <EyeOff className="mr-0.5 h-2.5 w-2.5" />
                            {t("internalOnly")}
                          </Badge>
                        )}
                        {prod.externalUrl && (
                          <Badge variant="secondary" className="text-[10px]">
                            <ExternalLink className="mr-0.5 h-2.5 w-2.5" />
                            {t("externalLinkBadge")}
                          </Badge>
                        )}
                      </div>

                      <div className="mt-3 flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 flex-1 text-xs"
                          onClick={() => openEditProduct(prod)}
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          {tc("edit")}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-500 hover:text-red-600"
                          onClick={() => {
                            if (confirm(t("deleteProductConfirm", { name: prod.name }))) {
                              deleteProdMut.mutate(prod.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Category Dialog */}
      <Dialog
        open={catDialog}
        onOpenChange={(open) => {
          if (!open) {
            setCatDialog(false);
            setEditingCat(null);
            setCatName("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingCat ? t("editCategory") : t("newCategory")}</DialogTitle>
            <DialogDescription>
              {t("categoriesGroupProducts")}
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={t("categoryPlaceholder")}
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
          />
          <Button
            onClick={() => {
              if (editingCat) {
                updateCatMut.mutate({ id: editingCat.id, name: catName });
              } else {
                createCatMut.mutate(catName);
              }
            }}
            disabled={!catName.trim() || createCatMut.isPending || updateCatMut.isPending}
          >
            {createCatMut.isPending || updateCatMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {editingCat ? tc("save") : tc("create")}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Product Dialog */}
      <Dialog open={prodDialog} onOpenChange={(open) => !open && closeProdDialog()}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProd ? t("editProduct") : t("newProduct")}</DialogTitle>
            <DialogDescription>
              {editingProd
                ? t("modifyProductDetails")
                : t("addNewProductToStore")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Image */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">{t("imageLabel")}</label>
              {form.imageUrl ? (
                <div className="relative w-full overflow-hidden rounded-xl">
                  <img
                    src={form.imageUrl}
                    alt="Preview"
                    className="aspect-square w-full object-cover"
                  />
                  <button
                    className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white transition hover:bg-black/70"
                    onClick={() => setForm((f) => ({ ...f, imageUrl: "" }))}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-8 text-sm text-muted transition hover:border-admin/40 hover:text-admin"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <ImagePlus className="h-5 w-5" />
                  )}
                  {uploading ? t("uploading") : t("uploadImage")}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
              <div className="mt-1.5">
                <Input
                  placeholder={t("pasteImageUrl")}
                  value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  className="text-xs"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">{t("nameRequired")}</label>
              <Input
                placeholder={t("productNamePlaceholder")}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">{t("description")}</label>
              <Input
                placeholder={t("shortDescription")}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">{t("priceRequired")}</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">{t("currency")}</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-admin/30"
                >
                  <option value="MXN">MXN</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">{t("categoryRequired")}</label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-admin/30"
              >
                <option value="">{t("selectOption")}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">
                {t("externalPurchaseLink")}
              </label>
              <Input
                placeholder={t("externalPurchasePlaceholder")}
                value={form.externalUrl}
                onChange={(e) => setForm((f) => ({ ...f, externalUrl: e.target.value }))}
              />
              <p className="mt-1 text-[11px] text-muted">
                {t("externalLinkHint")}
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isVisible: !f.isVisible }))}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  form.isVisible ? "bg-admin" : "bg-border",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 rounded-full bg-card transition-transform",
                    form.isVisible ? "translate-x-6" : "translate-x-1",
                  )}
                />
              </button>
              <div>
                <p className="text-sm font-medium">
                  {form.isVisible ? t("visibleForClients") : t("internalUseOnly")}
                </p>
                <p className="text-[11px] text-muted">
                  {form.isVisible
                    ? t("clientsCanBuy")
                    : t("onlySellFromStudio")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, availableForPreOrder: !f.availableForPreOrder }))
                }
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                  form.availableForPreOrder ? "bg-admin" : "bg-border",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 rounded-full bg-card transition-transform",
                    form.availableForPreOrder ? "translate-x-6" : "translate-x-1",
                  )}
                />
              </button>
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("preOrderForBookings")}</p>
                <p className="text-[11px] text-muted">{t("preOrderForBookingsDesc")}</p>
              </div>
            </div>

            {form.availableForPreOrder && studios.length > 0 && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  {t("availableInStudios")}
                </label>
                <div className="space-y-1 rounded-lg border border-border bg-card p-2">
                  {studios.map((s) => {
                    const checked = form.studioIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-surface/70"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setForm((f) => ({
                              ...f,
                              studioIds: e.target.checked
                                ? [...f.studioIds, s.id]
                                : f.studioIds.filter((id) => id !== s.id),
                            }));
                          }}
                          className="h-4 w-4 rounded border-border text-admin accent-admin"
                        />
                        {s.name}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  {form.studioIds.length === 0
                    ? t("availableInStudiosAllHint")
                    : t("availableInStudiosSomeHint", { count: form.studioIds.length })}
                </p>
              </div>
            )}
          </div>

          <Button
            onClick={handleSubmitProduct}
            disabled={!form.name.trim() || !form.price || !form.categoryId || saving}
            className="mt-2 w-full"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingProd ? t("saveChanges") : t("createProduct")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
