// Kargo sağlayıcı kayıt defteri — taşıyıcı kimliğinden `ShippingProvider` üretir.

import 'server-only';
import type { Carrier } from './carriers';
import type { ShippingProvider } from './provider';
import { manuelProvider } from './adapters/manuel';
import { yurticiProvider } from './adapters/yurtici';
import { arasProvider } from './adapters/aras';
import { mngProvider } from './adapters/mng';
import { suratProvider } from './adapters/surat';
import { pttProvider } from './adapters/ptt';

export async function getShippingProvider(carrier: Carrier): Promise<ShippingProvider> {
  switch (carrier) {
    case 'manuel':
    case 'kendi-kuryemiz':
      return manuelProvider(carrier);
    case 'yurtici':
      return yurticiProvider();
    case 'aras':
      return arasProvider();
    case 'mng':
      return mngProvider();
    case 'surat':
      return suratProvider();
    case 'ptt':
      return pttProvider();
    default:
      return manuelProvider('manuel');
  }
}
