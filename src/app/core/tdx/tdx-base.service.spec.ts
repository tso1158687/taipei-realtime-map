import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TdxBaseService } from './tdx-base.service';

describe('TdxBaseService', () => {
  let service: TdxBaseService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TdxBaseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('builds the upstream URL under /api/tdx and auto-adds $format=JSON', () => {
    service.get('v3/Rail/Metro/Network/TRTC').subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === '/api/tdx/v3/Rail/Metro/Network/TRTC' &&
        r.params.get('$format') === 'JSON'
    );
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('strips a leading slash from the path', () => {
    service.get('/v3/Bus/Route/City/Taipei').subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === '/api/tdx/v3/Bus/Route/City/Taipei'
    );
    req.flush({});
  });

  it('serialises numeric and string query params and drops null/undefined', () => {
    service
      .get('v3/Rail/TRA/TrainLiveBoard', {
        $top: 10,
        TrainNo: '152',
        empty: null,
        skipped: undefined,
      })
      .subscribe();

    const req = httpMock.expectOne((r) =>
      r.url.endsWith('/v3/Rail/TRA/TrainLiveBoard')
    );
    expect(req.request.params.get('$top')).toBe('10');
    expect(req.request.params.get('TrainNo')).toBe('152');
    expect(req.request.params.has('empty')).toBe(false);
    expect(req.request.params.has('skipped')).toBe(false);
    expect(req.request.params.get('$format')).toBe('JSON');
    req.flush({});
  });

  it('respects a caller-supplied $format and does not overwrite it', () => {
    service.get('v3/Rail/Metro/Shape/TRTC', { $format: 'GEOJSON' }).subscribe();

    const req = httpMock.expectOne(
      (r) => r.params.get('$format') === 'GEOJSON'
    );
    req.flush({});
  });

  it('returns the response body typed as the generic argument', () => {
    interface FakeResponse {
      readonly OperatorID: string;
    }
    let received: FakeResponse | undefined;
    service.get<FakeResponse>('v3/Rail/Metro/Network/TRTC').subscribe((res) => {
      received = res;
    });
    httpMock
      .expectOne(() => true)
      .flush({ OperatorID: 'TRTC' } satisfies FakeResponse);

    expect(received?.OperatorID).toBe('TRTC');
  });
});
