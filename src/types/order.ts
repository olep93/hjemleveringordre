export type OrderStatus =
  | "TO_PICK"
  | "PICKING"
  | "READY_FOR_LOADING"
  | "LOADED"
  | "DELIVERED"
  | "DEVIATION"
  | string;

export type FulfillmentMethod =
  | "THIS_THURSDAY"
  | "NEXT_THURSDAY"
  | "OWN_VEHICLE";

export type TransportType =
  | "STANDARD_CRANE_GROUND"
  | "LARGE_CRANE"
  | "VAN";

export type IdentifierType = "EAN" | "PLU";

export type BlobReference = {
  url?: string | null;
  pathname?: string | null;
  filename?: string | null;
  contentType?: string | null;
  size?: number | null;
};

export type OrderPhoto = BlobReference & {
  uploadedBy?: string | null;
  createdAt?: string | null;
};

export type OrderItem = {
  id: string;
  articleNumber?: string | null;
  identifierType?: IdentifierType | null;
  description: string;
  rawDescription?: string | null;
  lineComment?: string | null;
  bestNumber?: string | null;
  productName?: string | null;
  productUrl?: string | null;
  productImageUrl?: string | null;
  productImageBlob?: BlobReference | null;
  quantity: number;
  unit?: string | null;
  deliveredQuantity?: number | null;
  price?: number | null;
  lineTotal?: number | null;
  checked?: boolean;
  checkedBy?: string | null;
  checkedAt?: string | null;
  isFreight?: boolean;
};

export type OrderEvent = {
  id: string;
  type?: string | null;
  description?: string | null;
  actorName?: string | null;
  actorType?: string | null;
  createdAt?: string | null;
};

export type Order = {
  id: string;
  title: string;
  orderNumber?: string | null;
  customerName?: string | null;
  phone?: string | null;
  deliveryAddress?: string | null;
  deliveryDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  status: OrderStatus;
  placement?: string | null;
  locationCode?: string | null;
  fulfillmentMethod?: FulfillmentMethod | null;
  transportType?: TransportType | null;
  transportComment?: string | null;
  pickupDate?: string | null;
  pickupRecipientEmail?: string | null;
  pickupShareToken?: string | null;
  source?: string | null;
  pickedBy?: string | null;
  pickedAt?: string | null;
  pickingStartedAt?: string | null;
  pickingSessionOpen?: boolean;
  comment?: string | null;
  originalDocumentUrl?: string | null;
  originalDocumentPath?: string | null;
  originalDocumentBlob?: BlobReference | null;
  items?: OrderItem[];
  photos?: OrderPhoto[];
  events?: OrderEvent[];
};

export type DashboardOrder = Pick<
  Order,
  | "id"
  | "title"
  | "orderNumber"
  | "customerName"
  | "phone"
  | "deliveryDate"
  | "status"
  | "placement"
  | "pickedBy"
  | "createdAt"
> & {
  internalId?: string | null;
  photoCount: number;
  itemCount: number;
  checkedItemCount: number;
  importError?: string | null;
};
