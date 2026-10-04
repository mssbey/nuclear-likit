// `iyzipay` resmi SDK tip bildirimi sunmuyor; kullandığımız yüzey kadar tanım.
declare module 'iyzipay' {
  type Cb<T = Record<string, unknown>> = (err: unknown, result: T) => void;

  interface Resource {
    create(request: Record<string, unknown>, cb: Cb): void;
    retrieve(request: Record<string, unknown>, cb: Cb): void;
  }

  class Iyzipay {
    constructor(options: { apiKey: string; secretKey: string; uri: string });
    checkoutFormInitialize: Resource;
    checkoutForm: Resource;
    refund: Resource;
    payment: Resource;
    installmentInfo: Resource;
  }

  export = Iyzipay;
}
