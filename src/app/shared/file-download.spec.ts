import { fakeAsync, tick } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { Directory } from '@capacitor/filesystem';
import { downloadFile, fileDownloadIO, safeDownloadName, saveDownloadedFile } from './file-download';

describe('cross-platform file download', () => {
  for (const platform of ['ios', 'android']) {
    it('exports binary bytes through a cache file on ' + platform, async () => {
      spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
      const write = spyOn(fileDownloadIO, 'write').and.resolveTo({ uri: 'file:///cache/export.pdf' });
      const share = spyOn(fileDownloadIO, 'share').and.resolveTo({});
      const createUrl = spyOn(URL, 'createObjectURL');
      const blob = new Blob([new Uint8Array([0, 128, 255, 37, 80, 68, 70])], { type: 'application/pdf' });
      await saveDownloadedFile(blob, 'report.pdf');
      expect(write).toHaveBeenCalledWith(jasmine.objectContaining({
        directory: Directory.Cache, recursive: true,
        path: jasmine.stringMatching(/^mvanager-downloads\/[^/]+\/report\.pdf$/),
        data: btoa(String.fromCharCode(0, 128, 255, 37, 80, 68, 70)),
      }));
      expect(share).toHaveBeenCalledWith(jasmine.objectContaining({ files: ['file:///cache/export.pdf'] }));
      expect(createUrl).not.toHaveBeenCalled();
    });
  }

  it('does not overwrite another export with the same name', async () => {
    spyOn(fileDownloadIO, 'native').and.returnValue(true);
    const write = spyOn(fileDownloadIO, 'write').and.resolveTo({ uri: 'file:///cache/export.pdf' });
    spyOn(fileDownloadIO, 'share').and.resolveTo({});
    await saveDownloadedFile(new Blob(['a']), 'report.pdf');
    await saveDownloadedFile(new Blob(['b']), 'report.pdf');
    expect(write.calls.argsFor(0)[0].path).not.toBe(write.calls.argsFor(1)[0].path);
  });

  it('keeps the browser URL alive after click, then releases it', fakeAsync(() => {
    spyOn(fileDownloadIO, 'native').and.returnValue(false);
    const write = spyOn(fileDownloadIO, 'write');
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    const revoke = spyOn(URL, 'revokeObjectURL');
    const click = spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function(this: HTMLAnchorElement) {
      expect(this.isConnected).toBeTrue();
      expect(this.download).toBe('report.pdf');
    });
    void saveDownloadedFile(new Blob(['pdf']), 'report.pdf');
    expect(click).toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    tick(1);
    expect(revoke).not.toHaveBeenCalled();
    tick(59999);
    expect(revoke).toHaveBeenCalledWith('blob:test');
    expect(document.querySelector('a[href="blob:test"]')).toBeNull();
  }));

  it('reports native disk errors instead of rejecting an RxJS callback silently', async () => {
    spyOn(fileDownloadIO, 'native').and.returnValue(true);
    spyOn(fileDownloadIO, 'write').and.rejectWith(new Error('disk full'));
    const share = spyOn(fileDownloadIO, 'share');
    const report = jasmine.createSpy();
    spyOn(console, 'error');
    expect(await downloadFile(new Blob(['pdf']), 'report.pdf', report)).toBeFalse();
    expect(report).toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  });

  it('treats dismissing the native panel as cancellation, not an error', async () => {
    spyOn(fileDownloadIO, 'native').and.returnValue(true);
    spyOn(fileDownloadIO, 'write').and.resolveTo({ uri: 'file:///cache/export.pdf' });
    spyOn(fileDownloadIO, 'share').and.rejectWith(new Error('Share canceled'));
    const report = jasmine.createSpy();
    expect(await downloadFile(new Blob(['pdf']), 'report.pdf', report)).toBeFalse();
    expect(report).not.toHaveBeenCalled();
  });

  it('rejects empty files and neutralizes path separators', async () => {
    expect(safeDownloadName('../report/2026.pdf')).toBe('_report_2026.pdf');
    await expectAsync(saveDownloadedFile(new Blob([]), 'empty.pdf')).toBeRejected();
  });
});
