import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AutomaticAddInspectionToCalendarService {

  pass=false;
  numeroPreventivo: string = '';
  telefono: string = '';
  displayName: string = '';
  pendingCustomerEvent = false;
  numeroCliente: string = '';
  customerEventCategory: string = '';
  customerEventDescription: string = '';

  constructor() { }
}
