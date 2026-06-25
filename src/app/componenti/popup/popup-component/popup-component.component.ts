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

  get messageLines(): string[] {
    return this.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => !!line);
  }

  get headline(): string {
    return this.messageLines[0] || '';
  }

  get detailLines(): string[] {
    return this.messageLines.slice(1);
  }

  closeDialog(){
    this.popup.closePopup();
  }
}
