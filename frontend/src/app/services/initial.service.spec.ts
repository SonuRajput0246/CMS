import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { InitialService } from './initial.service';
import { AppConfig } from '../core/config/config';

/**
 * Covers the boot step: static config supplies the API base URL.
 *
 * There is no second step any more. The app serves one product, so there is no
 * instance type to reconcile against the backend -- which also means a
 * successful boot is exactly one request, and `verify()` below is what pins
 * that. If a second call is ever reintroduced, these tests fail rather than
 * leaving the extra round-trip invisible.
 */
describe('InitialService', () => {

  const CONFIG = {
    global_setting: {
      api_base_url: 'http://localhost:5000'
    }
  };

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    const service = TestBed.inject(InitialService);
    const httpMock = TestBed.inject(HttpTestingController);
    return { service, httpMock };
  }

  /**
   * Issue a boot and flush the static-config request.
   *
   * Returns the in-flight promise so the caller can await it and then verify
   * that nothing else was requested.
   */
  function startBoot(service: InitialService, httpMock: HttpTestingController, cfg: any) {
    const promise = service.loadAppConfig();
    httpMock.expectOne(r => r.url === 'assets/config.json').flush(cfg);
    return promise;
  }

  it('publishes the API base URL from config.json', async () => {
    const { service, httpMock } = setup();

    const promise = startBoot(service, httpMock, CONFIG);
    await promise;
    httpMock.verify();

    expect(TestBed.inject(AppConfig).get('BASE_URL')).toBe('http://localhost:5000');
  });

  it('asks the backend for nothing else during boot', async () => {
    // Guards the reason the second step was removed: one product, so one
    // request. A reintroduced instance-config call would fail verify().
    const { service, httpMock } = setup();

    const promise = startBoot(service, httpMock, CONFIG);
    await promise;

    httpMock.expectNone(r => r.url.includes('/api/'));
    httpMock.verify();
  });

  it('rejects when api_base_url is missing', async () => {
    // Without a base URL there is nothing to call, so boot cannot continue.
    // This is the one failure that is allowed to propagate: the APP_INITIALIZER
    // awaits it, and stopping here beats every later request failing with an
    // opaque network error.
    const broken = { global_setting: {} };
    const { service, httpMock } = setup();

    const promise = service.loadAppConfig();
    httpMock.expectOne(r => r.url === 'assets/config.json').flush(broken);

    await expectAsync(promise).toBeRejected();
    httpMock.verify();
  });

  it('rejects when config.json itself cannot be fetched', async () => {
    const { service, httpMock } = setup();

    const promise = service.loadAppConfig();
    httpMock.expectOne(r => r.url === 'assets/config.json')
      .error(new ProgressEvent('network error'));

    await expectAsync(promise).toBeRejected();
    httpMock.verify();
  });

});
