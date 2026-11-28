import {CommonModule} from '@angular/common';
import {Component,ViewChild} from '@angular/core';
import {ActivatedRoute,Router} from '@angular/router';
import {GlobalService} from '../../service/global.service';
import {CustomerTicketsComponent} from '../../public/customer-portal/customer-tickets.component';
@Component({selector:'app-customer-tickets-admin',standalone:true,imports:[CommonModule,CustomerTicketsComponent],template:`<div class="mv-page"><header class="mv-entity-toolbar"><div class="mv-entity-toolbar__title"><h1>Gestione ticket clienti</h1></div><button class="mv-toolbar-back" type="button" (click)="back()">← Torna indietro</button></header>
  <div class="mv-card" style="padding:20px;margin-top:20px"><p *ngIf="customerId">Ticket del cliente {{global.customerNumber(customerId)}}. <button type="button" class="btn btn-outline-secondary" (click)="showAll()">Mostra tutti i clienti</button></p>
  <app-customer-tickets [admin]="true" [api]="global.url+'admin/customer-portal/'" [tenant]="tenant" [token]="global.token" [customerId]="customerId" [canReply]="global.hasPermission('CUSTOMER_TICKETS_REPLY')" [canManage]="global.hasPermission('CUSTOMER_TICKETS_MANAGE')" (sessionExpired)="global.logout()" /></div></div>`})
export class CustomerTicketsAdminComponent {
  readonly realtimeResources=['customer_tickets'];
  @ViewChild(CustomerTicketsComponent) ticketView?:CustomerTicketsComponent;
  refreshRealtimeData(){if(!this.ticketView?.busy)void this.ticketView?.load();}
  customerId='';tenant='';constructor(public global:GlobalService,private route:ActivatedRoute,private router:Router){this.route.queryParamMap.subscribe(params=>this.customerId=params.get('customerId')||'');this.tenant=String(global.headers.get('X-Tenant-Id')||'');}
  back(){this.router.navigateByUrl('/homeAdmin');}showAll(){this.router.navigate([], {relativeTo:this.route,queryParams:{}});}
}
