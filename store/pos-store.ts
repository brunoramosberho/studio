import { create } from "zustand";

export interface PosCustomer {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  image: string | null;
}

export interface PosCartItem {
  id: string;
  type: "package" | "product";
  referenceId: string;
  name: string;
  price: number;
  currency: string;
  quantity: number;
  metadata?: Record<string, unknown>;
}

export interface PosSelectedClass {
  classId: string;
  classTypeId: string;
  classTypeName: string;
  label: string;
  startsAt: string;
  hasCredits: boolean;
  packageId?: string;
  packageName?: string;
  spotNumber?: number | null;
}

export type PosStep = "customer" | "cart" | "payment" | "confirmation";

export type PosPaymentMethod = "saved_card" | "terminal" | "cash";

export interface PosSaleResult {
  id: string;
  total: number;
  currency: string;
  items: PosCartItem[];
  selectedClass?: PosSelectedClass | null;
  paymentMethod: PosPaymentMethod;
  customerName: string;
}

interface PosOpenOptions {
  customer?: PosCustomer;
  cartItems?: Omit<PosCartItem, "id">[];
  selectedClass?: PosSelectedClass;
  onComplete?: () => void;
}

interface PosState {
  isOpen: boolean;
  step: PosStep;
  customer: PosCustomer | null;
  cart: PosCartItem[];
  selectedClass: PosSelectedClass | null;
  saleResult: PosSaleResult | null;
  onComplete: (() => void) | null;

  openPOS: (customerOrOptions?: PosCustomer | PosOpenOptions) => void;
  closePOS: () => void;
  setStep: (step: PosStep) => void;
  setCustomer: (customer: PosCustomer | null) => void;
  setSelectedClass: (cls: PosSelectedClass | null) => void;
  addToCart: (item: Omit<PosCartItem, "id">) => void;
  removeFromCart: (id: string) => void;
  updateCartQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  setSaleResult: (result: PosSaleResult | null) => void;
  reset: () => void;

  cartTotal: () => number;
}

let itemCounter = 0;

export const usePosStore = create<PosState>((set, get) => ({
  isOpen: false,
  step: "customer",
  customer: null,
  cart: [],
  selectedClass: null,
  saleResult: null,
  onComplete: null,

  openPOS: (customerOrOptions) => {
    let customer: PosCustomer | undefined;
    let cartItems: Omit<PosCartItem, "id">[] | undefined;
    let selectedClass: PosSelectedClass | undefined;
    let onComplete: (() => void) | undefined;

    if (customerOrOptions && "email" in customerOrOptions) {
      customer = customerOrOptions as PosCustomer;
    } else if (customerOrOptions) {
      const opts = customerOrOptions as PosOpenOptions;
      customer = opts.customer;
      cartItems = opts.cartItems;
      selectedClass = opts.selectedClass;
      onComplete = opts.onComplete;
    }

    const prefilled: PosCartItem[] = (cartItems ?? []).map((item) => {
      itemCounter++;
      return { ...item, id: `pos-item-${itemCounter}` };
    });

    set({
      isOpen: true,
      step: customer ? "cart" : "customer",
      customer: customer ?? null,
      cart: prefilled,
      selectedClass: selectedClass ?? null,
      saleResult: null,
      onComplete: onComplete ?? null,
    });
  },

  closePOS: () => {
    const cb = get().onComplete;
    set({
      isOpen: false,
      step: "customer",
      customer: null,
      cart: [],
      selectedClass: null,
      saleResult: null,
      onComplete: null,
    });
    cb?.();
  },

  setStep: (step) => set({ step }),
  setCustomer: (customer) => set({ customer }),
  setSelectedClass: (cls) => set({ selectedClass: cls }),

  addToCart: (item) => {
    const existing = get().cart.find(
      (c) => c.type === item.type && c.referenceId === item.referenceId,
    );
    if (existing && item.type === "product") {
      set({
        cart: get().cart.map((c) =>
          c.id === existing.id ? { ...c, quantity: c.quantity + item.quantity } : c,
        ),
      });
    } else {
      itemCounter++;
      set({ cart: [...get().cart, { ...item, id: `pos-item-${itemCounter}` }] });
    }
  },

  removeFromCart: (id) => set({ cart: get().cart.filter((c) => c.id !== id) }),

  updateCartQuantity: (id, quantity) => {
    if (quantity <= 0) {
      set({ cart: get().cart.filter((c) => c.id !== id) });
    } else {
      set({
        cart: get().cart.map((c) => (c.id === id ? { ...c, quantity } : c)),
      });
    }
  },

  clearCart: () => set({ cart: [] }),
  setSaleResult: (result) => set({ saleResult: result }),

  reset: () =>
    set({
      isOpen: false,
      step: "customer",
      customer: null,
      cart: [],
      selectedClass: null,
      saleResult: null,
      onComplete: null,
    }),

  cartTotal: () => get().cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
}));
