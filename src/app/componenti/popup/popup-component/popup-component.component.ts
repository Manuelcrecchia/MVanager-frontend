import { Component } from '@angular/core';
import { PopupServiceService } from '../popup-service.service';

@Component({
  selector: 'app-popup-component',
  templateUrl: './popup-component.component.html',
  styleUrl: './popup-component.component.css'
})
export class PopupComponentComponent {
  constructor(private popup: PopupServiceService){}

  get text(): string {
    return this.popup.text;
  }

  get title(): string {
    return this.popup.title;
  }

  get type(): string {
    return this.popup.type;
  }

  closeDialog(){
    this.popup.closePopup();
  }
}
