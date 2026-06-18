import { Component } from '@angular/core';
import { GlobalService } from '../../../service/global.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { PopupServiceService } from '../../popup/popup-service.service';

@Component({
  selector: 'app-passworddimenticata',
  templateUrl: './passworddimenticata.component.html',
  styleUrl: './passworddimenticata.component.css'
})
export class PassworddimenticataComponent {
  constructor(private globalService: GlobalService, private http: HttpClient, private router: Router, private popup: PopupServiceService) { }



resetPassword(newPassword:string, code:string){
  const body = {email: this.globalService.email, password: newPassword, code: code};
        this.http.post(this.globalService.url + "admin/restorePassword", body, {headers: this.globalService.headers, responseType: 'text'}).subscribe(response => {
          if(response == 'NOCODE'){
            this.popup.text = "Il codice di conferma da te inserito è errato";
            this.popup.openPopup();
          }
          else{
            this.router.navigateByUrl('/loginPrivateArea');
          }
        }, (err) => {
          const serverMessage =
            err?.error?.error ||
            err?.error?.response ||
            (typeof err?.error === 'string' ? err.error : '');
          this.popup.text = serverMessage || 'Errore durante il reset password. Riprova.';
          this.popup.openPopup();
        })
}



  back(){
    this.router.navigateByUrl('/');
  }

}
