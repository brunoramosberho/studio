"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CalendarSync,
  Package,
  ShoppingBag,
  Banknote,
  Plus,
  Minus,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClassPicker } from "./class-picker";
import { SpotPicker } from "./spot-picker";
import { usePosStore, type PosSelectedClass } from "@/store/pos-store";
import { cn, formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/components/tenant-provider";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

type CartCategory = "class" | "membership" | "package" | "product";

interface PackageItem {
  id: string;
  name: string;
  type: string;
  price: number;
  currency: string;
  credits: number | null;
  validDays: number;
  isActive: boolean;
  classTypes: { id: string; name: string }[];
}

interface ProductVariant {
  id: string;
  title: string;
  sku: string | null;
  price: number;
  currency: string;
  options: { name: string; value: string }[];
  /** Units available at the POS location; null = inventory not tracked. */
  available: number | null;
}

interface ProductItem {
  id: string;
  title: string;
  productType: string | null;
  imageUrl: string | null;
  variants: ProductVariant[];
}

interface ProductCategory {
  id: string;
  name: string;
  products: ProductItem[];
}

interface PosProductsResponse {
  source: "shopify" | "native";
  categories: ProductCategory[];
  shopifyError?: string;
}

type CategoryDef = {
  key: CartCategory;
  labelKey: "classLabel" | "membership" | "package" | "product";
  icon: typeof CalendarDays;
};

const CATEGORIES: CategoryDef[] = [
  { key: "class", labelKey: "classLabel", icon: CalendarDays },
  { key: "membership", labelKey: "membership", icon: CalendarSync },
  { key: "package", labelKey: "package", icon: Package },
  { key: "product", labelKey: "product", icon: ShoppingBag },
];

export function CartStep() {
  const t = useTranslations("pos");
  const tc = useTranslations("common");
  const tenantCurrency = useCurrency();
  const {
    customer,
    cart,
    selectedClass,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    setStep,
    setSelectedClass,
    cartTotal,
  } = usePosStore();

  const initialCategory = selectedClass && !selectedClass.hasCredits ? "package" : "class";
  const [activeCategory, setActiveCategory] = useState<CartCategory>(initialCategory);
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [showSpotPicker, setShowSpotPicker] = useState(
    !!selectedClass && selectedClass.spotNumber === undefined,
  );
  const [productSearch, setProductSearch] = useState("");
  const [productCat, setProductCat] = useState<string>("all");

  const { data: packages = [], isLoading: packagesLoading } = useQuery<
    PackageItem[]
  >({
    queryKey: ["pos-packages-all"],
    queryFn: async () => {
      const res = await fetch("/api/packages?all=true");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: productData, isLoading: productsLoading } =
    useQuery<PosProductsResponse>({
      queryKey: ["pos-products"],
      queryFn: async () => {
        const res = await fetch("/api/admin/pos/products");
        if (!res.ok) return { source: "native", categories: [] };
        return res.json();
      },
      staleTime: 30_000,
    });

  const productCategories = productData?.categories ?? [];

  const memberships = packages.filter(
    (p) => p.type === "SUBSCRIPTION" && p.isActive,
  );
  const packs = packages.filter(
    (p) => (p.type === "PACK" || p.type === "OFFER") && p.isActive,
  );

  const scopedProducts =
    productCat === "all"
      ? productCategories.flatMap((c) => c.products)
      : (productCategories.find((c) => c.id === productCat)?.products ?? []);
  const filteredProducts = productSearch.trim()
    ? scopedProducts.filter((p) =>
        p.title.toLowerCase().includes(productSearch.toLowerCase()),
      )
    : scopedProducts;

  function handleClassSelected(
    cls: { id: string; classType: { id: string; name: string }; startsAt: string },
    creditInfo: { hasCredits: boolean; packageName?: string; packageId?: string },
  ) {
    const label = `${cls.classType.name} — ${format(new Date(cls.startsAt), "EEE d MMM HH:mm", { locale: es })}`;

    const newClass: PosSelectedClass = {
      classId: cls.id,
      classTypeId: cls.classType.id,
      classTypeName: cls.classType.name,
      label,
      startsAt: cls.startsAt,
      hasCredits: creditInfo.hasCredits,
      packageId: creditInfo.packageId,
      packageName: creditInfo.packageName,
    };

    setSelectedClass(newClass);
    setShowSpotPicker(true);

    if (!creditInfo.hasCredits) {
      setActiveCategory("package");
    }
  }

  function handleAddPackage(pkg: PackageItem) {
    addToCart({
      type: "package",
      referenceId: pkg.id,
      name: pkg.name,
      price: pkg.price,
      currency: pkg.currency,
      quantity: 1,
      metadata: { packageType: pkg.type },
    });
    toast.success(t("addedToCart", { name: pkg.name }));
  }

  const isShopify = productData?.source === "shopify";

  function variantLabel(product: ProductItem, variant: ProductVariant): string {
    // Prefer the option values ("M / Negro"); fall back to the variant title.
    const opts = variant.options
      .map((o) => o.value)
      .filter(Boolean)
      .join(" / ");
    const suffix = opts || (variant.title === product.title ? "" : variant.title);
    return suffix ? `${product.title} · ${suffix}` : product.title;
  }

  function handleAddVariant(product: ProductItem, variant: ProductVariant) {
    const name = variantLabel(product, variant);
    addToCart({
      type: "product",
      // Use the variant id as the cart key so different sizes don't merge.
      referenceId: variant.id,
      name,
      price: variant.price,
      currency: variant.currency,
      quantity: 1,
      shopifyVariantId: isShopify ? variant.id : undefined,
      variantName: variant.title,
    });
    if (variant.available != null && variant.available <= 0) {
      toast.warning(t("soldOutButAdded", { name }));
    } else {
      toast.success(t("addedToCart", { name }));
    }
  }

  // Stock badge for a variant. Untracked inventory (null) shows nothing; zero
  // or less shows "Agotado" (but selling is still allowed); low stock is amber.
  function renderStock(available: number | null, inline = false) {
    if (available == null) return null;
    if (available <= 0) {
      return (
        <span
          className={cn(
            "rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-300",
            !inline && "mt-0.5 inline-block",
          )}
        >
          {t("soldOut")}
        </span>
      );
    }
    const low = available <= 3;
    return (
      <span
        className={cn(
          "text-[10px] font-medium",
          inline ? "" : "mt-0.5 block",
          low ? "text-amber-600 dark:text-amber-400" : "text-muted",
        )}
      >
        {t("unitsAvailable", { n: available })}
      </span>
    );
  }

  const total = cartTotal();
  const canProceed = cart.length > 0 || (selectedClass?.hasCredits === true);

  return (
    <div className="space-y-4">
      <h3 className="font-display text-base font-bold">{t("cart")}</h3>

      {/* Selected class context banner */}
      {selectedClass && (
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-lg border p-3",
            selectedClass.hasCredits
              ? "border-green-200 bg-green-50/60"
              : "border-orange-200 bg-orange-50/60",
          )}
        >
          {selectedClass.hasCredits ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
          )}
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-foreground">
              {selectedClass.label}
              {selectedClass.spotNumber != null && (
                <span className="ml-1.5 text-muted">
                  · {t("spotLabel", { num: selectedClass.spotNumber })}
                </span>
              )}
            </p>
            {selectedClass.hasCredits ? (
              <p className="text-green-700">
                {t("hasCreditsMsg", {
                  packageName: selectedClass.packageName ?? "",
                })}
              </p>
            ) : (
              <p className="text-orange-700">
                {t("noCreditsMsg")}
              </p>
            )}
          </div>
          <button
            onClick={() => setSelectedClass(null)}
            className="shrink-0 rounded p-0.5 text-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex gap-4">
        {/* Category sidebar */}
        <div className="w-48 shrink-0 space-y-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                activeCategory === cat.key
                  ? "bg-admin/10 text-admin"
                  : "text-foreground/70 hover:bg-surface",
              )}
            >
              <cat.icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  activeCategory === cat.key ? "text-admin" : "text-muted/50",
                )}
              />
              {t(cat.labelKey)}
            </button>
          ))}
        </div>

        {/* Category content */}
        <div className="flex-1 min-w-0">
          {/* Class */}
          {activeCategory === "class" && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">{t("classLabel")}</h4>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border border-border bg-surface/50 px-3 py-2.5 text-sm text-muted">
                  {selectedClass ? selectedClass.label : t("selectAClass")}
                </div>
                <button
                  onClick={() => setShowClassPicker(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted transition-colors hover:bg-surface hover:text-foreground"
                >
                  <CalendarDays className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setShowClassPicker(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted transition-colors hover:bg-surface hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {!selectedClass && (
                <p className="text-xs text-muted">
                  {t("selectClassOptional")}
                </p>
              )}
            </div>
          )}

          {/* Memberships */}
          {activeCategory === "membership" && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">{t("membership")}</h4>
              {packagesLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted" />
                </div>
              ) : memberships.length === 0 ? (
                <p className="py-4 text-sm text-muted">
                  {t("noMembershipsYet")}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {memberships.map((pkg) => (
                    <button
                      key={pkg.id}
                      onClick={() => handleAddPackage(pkg)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5 text-left transition-colors hover:bg-surface"
                    >
                      <CalendarSync className="h-4 w-4 shrink-0 text-admin/60" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{pkg.name}</p>
                        <p className="text-xs text-muted">
                          {pkg.credits ? t("credits", { num: pkg.credits }) : t("unlimited")}
                          {" · "}
                          {t("days", { num: pkg.validDays })}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-foreground">
                        {formatCurrency(pkg.price, pkg.currency)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Packages */}
          {activeCategory === "package" && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">{t("packagesAndCredits")}</h4>
              {packagesLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted" />
                </div>
              ) : packs.length === 0 ? (
                <p className="py-4 text-sm text-muted">
                  {t("noPackagesAvailable")}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {packs.map((pkg) => (
                    <button
                      key={pkg.id}
                      onClick={() => handleAddPackage(pkg)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5 text-left transition-colors hover:bg-surface"
                    >
                      <Package className="h-4 w-4 shrink-0 text-admin/60" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{pkg.name}</p>
                        <p className="text-xs text-muted">
                          {pkg.credits ? t("credits", { num: pkg.credits }) : t("unlimited")}
                          {" · "}
                          {t("days", { num: pkg.validDays })}
                          {pkg.classTypes.length > 0 &&
                            ` · ${pkg.classTypes.map((ct) => ct.name).join(", ")}`}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-foreground">
                        {formatCurrency(pkg.price, pkg.currency)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Products */}
          {activeCategory === "product" && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">{t("product")}</h4>

              {productData?.shopifyError && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-2.5 text-[11px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{t("shopifyInventoryError")}</span>
                </div>
              )}

              {/* Category filter */}
              {productCategories.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setProductCat("all")}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      productCat === "all"
                        ? "border-admin bg-admin/10 text-admin"
                        : "border-border text-muted hover:bg-surface",
                    )}
                  >
                    {t("allCategories")}
                  </button>
                  {productCategories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setProductCat(c.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        productCat === c.id
                          ? "border-admin bg-admin/10 text-admin"
                          : "border-border text-muted hover:bg-surface",
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-muted/50" />
                <input
                  type="text"
                  placeholder={t("searchProduct")}
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/50"
                />
              </div>
              {productsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <p className="py-4 text-sm text-muted">
                  {t("noProductsAvailable")}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {filteredProducts.map((product) => {
                    const single = product.variants.length === 1;
                    return (
                      <div
                        key={product.id}
                        className="rounded-lg border border-border/50 bg-card px-3 py-2.5"
                      >
                        <button
                          type="button"
                          disabled={!single}
                          onClick={
                            single
                              ? () => handleAddVariant(product, product.variants[0])
                              : undefined
                          }
                          className={cn(
                            "flex w-full items-center gap-3 text-left",
                            single && "transition-opacity hover:opacity-80",
                          )}
                        >
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface">
                              <ShoppingBag className="h-4 w-4 text-muted/50" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{product.title}</p>
                            {single ? (
                              renderStock(product.variants[0].available)
                            ) : (
                              <p className="text-xs text-muted">
                                {t("pickSize")}
                              </p>
                            )}
                          </div>
                          <span className="text-sm font-semibold text-foreground">
                            {formatCurrency(
                              product.variants[0].price,
                              product.variants[0].currency,
                            )}
                          </span>
                        </button>

                        {/* Variant / size chips */}
                        {!single && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5 pl-[52px]">
                            {product.variants.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => handleAddVariant(product, v)}
                                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/40 px-2.5 py-1.5 text-xs transition-colors hover:bg-surface"
                              >
                                <span className="font-medium">
                                  {v.options.map((o) => o.value).join(" / ") ||
                                    v.title}
                                </span>
                                {renderStock(v.available, true)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cart summary */}
      <div className="rounded-lg border border-border/60 bg-surface/30">
        {cart.length === 0 && !selectedClass?.hasCredits ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            {t("addProductsToCart")}
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {cart.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted">
                    {formatCurrency(item.price, item.currency)}
                  </p>
                </div>
                {item.type === "product" && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        updateCartQuantity(item.id, item.quantity - 1)
                      }
                      className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-medium">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() =>
                        updateCartQuantity(item.id, item.quantity + 1)
                      }
                      className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <span className="text-sm font-semibold tabular-nums">
                  {formatCurrency(item.price * item.quantity, item.currency)}
                </span>
                <button
                  onClick={() => removeFromCart(item.id)}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {/* Show class reservation row (no price, just info) */}
            {selectedClass?.hasCredits && (
              <div className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{selectedClass.label}</p>
                  <p className="text-xs text-green-600">{t("reserveWithCredits")}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-green-600">
                  {tc("free")}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold">{t("total")}</span>
              <span className="text-base font-bold">
                {total > 0
                  ? formatCurrency(total, cart[0]?.currency ?? tenantCurrency.code)
                  : tc("free")}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setStep("customer")}>
          {tc("cancel")}
        </Button>
        <Button
          size="sm"
          className="bg-admin text-white hover:bg-admin/90"
          onClick={() => setStep("payment")}
          disabled={!canProceed}
        >
          <Banknote className="mr-1.5 h-3.5 w-3.5" />
          {t("charge")}
        </Button>
      </div>

      {/* Class picker dialog */}
      {customer && (
        <ClassPicker
          open={showClassPicker}
          onOpenChange={setShowClassPicker}
          customer={customer}
          onClassSelected={handleClassSelected}
        />
      )}

      {/* Spot picker dialog */}
      {selectedClass && (
        <SpotPicker
          open={showSpotPicker}
          onOpenChange={setShowSpotPicker}
          classId={selectedClass.classId}
          className={selectedClass.label}
          onSpotSelected={(spotNumber) => {
            setSelectedClass({ ...selectedClass, spotNumber });
            setShowSpotPicker(false);
            toast.success(t("spotLabel", { num: spotNumber }));
          }}
          onSkip={() => {
            setSelectedClass({ ...selectedClass, spotNumber: null });
            setShowSpotPicker(false);
          }}
        />
      )}
    </div>
  );
}
