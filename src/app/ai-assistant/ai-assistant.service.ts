import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { GlobalService } from '../service/global.service';

export interface AiAction {
  name: string;
  arguments: Record<string, any>;
}

export interface AiUiPayload {
  type: 'none' | 'message' | 'question' | 'confirmation' | 'navigation' | 'error';
  title: string;
  summary: string[];
}

export interface AiMissingField {
  field: string;
  label: string;
  reason?: string;
}

export interface AiConversationHistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

export interface AiCommandResponse {
  requestId: string;
  provider: string;
  steps: number;
  commandId: string | null;
  expiresAt: string | null;
  schemaVersion: string;
  type: 'final';
  status: 'ready' | 'needs_clarification' | 'answer' | 'rejected' | 'error';
  reply: string;
  action: AiAction | null;
  ui: AiUiPayload;
  missingFields: AiMissingField[];
  requiresConfirmation: boolean;
  confidence: number;
}

export interface AiExecuteResponse {
  ok: boolean;
  commandId: string;
  action: AiAction;
  result: Record<string, any>;
}

export interface AiTranscriptionResponse {
  text: string;
  normalizedText?: string;
  normalizationNotes?: string[];
  provider: string;
  language: string;
}

@Injectable({
  providedIn: 'root',
})
export class AiAssistantService {
  constructor(
    private http: HttpClient,
    private globalService: GlobalService,
  ) {}

  sendCommand(
    message: string,
    currentRoute: string,
    history: AiConversationHistoryItem[] = [],
    pendingCommandId: string | null = null,
  ): Observable<AiCommandResponse> {
    return this.http.post<AiCommandResponse>(
      `${this.globalService.url}admin/ai/command`,
      {
        message,
        currentRoute,
        history,
        pendingCommandId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome',
        userCode: this.globalService.userCode,
        platform: this.globalService.forMobile ? 'mobile' : 'web',
      },
      {
        headers: new HttpHeaders({ 'X-Skip-Global-Error-Popup': 'true' }),
      },
    );
  }

  execute(commandId: string): Observable<AiExecuteResponse> {
    return this.http.post<AiExecuteResponse>(
      `${this.globalService.url}admin/ai/execute`,
      { commandId },
      {
        headers: new HttpHeaders({ 'X-Skip-Global-Error-Popup': 'true' }),
      },
    );
  }

  transcribeAudio(audio: Blob): Observable<AiTranscriptionResponse> {
    const formData = new FormData();
    const extension = audio.type.includes('mp4') || audio.type.includes('m4a') ? 'm4a' : 'webm';
    formData.append('audio', audio, `mvanager-voice.${extension}`);
    formData.append('language', 'it');
    return this.http.post<AiTranscriptionResponse>(
      `${this.globalService.url}admin/ai/transcribe`,
      formData,
      {
        headers: new HttpHeaders({ 'X-Skip-Global-Error-Popup': 'true' }),
      },
    );
  }
}
