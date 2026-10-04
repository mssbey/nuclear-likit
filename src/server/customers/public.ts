// Müşteri kaydının istemciye gönderilen alt kümesi — parola özeti, oturum
// kimliği ve panel notu asla dışarı çıkmaz.

export interface PublicCustomer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  marketingOptIn: boolean;
}

export function publicCustomer(c: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  marketingOptIn: boolean;
}): PublicCustomer {
  return {
    id: c.id,
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    marketingOptIn: c.marketingOptIn,
  };
}
