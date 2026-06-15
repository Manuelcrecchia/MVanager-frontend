import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class QuoteModelService {
  numeroPreventivo = '';
  codiceOperatore = '';
  data = '';
  tipoPreventivo = '';
  complete = '';

  constructor() {}

  resetQuoteModel() {
    for (const key of Object.keys(this as any)) {
      delete (this as any)[key];
    }
    this.numeroPreventivo = '';
    this.codiceOperatore = '';
    this.data = '';
    this.tipoPreventivo = '';
    this.complete = '';
  }
}
