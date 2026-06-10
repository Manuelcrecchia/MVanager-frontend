import { Component } from '@angular/core';
import { GlobalService } from '../../../service/global.service';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { PopupServiceService } from '../../popup/popup-service.service';

@Component({
  selector: 'app-cambiapassword',
  templateUrl: './cambiapassword.component.html',
  styleUrl: './cambiapassword.component.css'
})
export class CambiapasswordComponent {
  constructor(private globalService: GlobalService, private http: HttpClient, private router: Router, private popup: PopupServiceService) { }

  changePassword(password: string) {
    const body = { password };

    this.http.post(this.globalService.url + "admin/resetPassword", body, {
      headers: this.globalService.headers,
      responseType: 'text',
    }).subscribe({
      next: () => {
        this.router.navigateByUrl('/loginPrivateArea');
      },
      error: (error) => {
        let message = error?.error?.error || error?.error || 'Cambio password non riuscito';
        if (typeof message === 'string') {
          try {
            message = JSON.parse(message)?.error || message;
          } catch {}
        }
        alert(message);
      },
    });
  }


  back(){
    this.router.navigateByUrl('/homeAdmin');
  }
}
