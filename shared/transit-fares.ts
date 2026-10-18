/** A reviewed reference estimate, never a ticket quote or a live operator price. */
export interface TransitFareReference {
  id: string;
  label: string;
  url: string;
  checkedOn: string;
  publishedOn?: string;
  evidence: 'operator-policy' | 'government-policy' | 'government-report';
}

export interface TransitLegFare {
  currency: 'PKR';
  amount: number | null;
  status: 'reference' | 'unknown';
  reference?: TransitFareReference;
  reason?: 'unverified-route' | 'historical-price-unavailable' | 'additional-fare-possible';
}

export interface TransitJourneyFare {
  currency: 'PKR';
  /** Present only when every boarding has a supported base reference. */
  total: number | null;
  /** The subtotal of supported references; never presented as a complete total. */
  knownSubtotal: number;
  status: 'complete' | 'partial' | 'unknown';
  unknownRides: number;
  checkedOn: string;
  basis: 'general-adult-single-boarding-reference';
}
