import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class CustomerModelService {
  numeroCliente = '';
  numeroPreventivo = '';
  tipoCliente = '';
  codiceOperatore = '';
  data = '';
  password = '';

  constructor() {}

  populateFromQuote(quote: Record<string, any> | null | undefined, numeroPreventivo: string): void {
    this.reset();
    Object.assign(this as any, quote || {});
    this.numeroPreventivo = numeroPreventivo;

    const quoteType = String((quote || {})['tipoPreventivo'] || '').trim();
    if (quoteType) {
      this.tipoCliente = quoteType;
    }
  }

  reset(): void {
    for (const key of Object.keys(this as any)) {
      delete (this as any)[key];
    }

    this.numeroCliente = '';
    this.numeroPreventivo = '';
    this.tipoCliente = '';
    this.codiceOperatore = '';
    this.data = '';
    this.password = '';
  }
}
