import { TestBed } from '@angular/core/testing';
import { TdxClientCache } from './client-cache';

describe('TdxClientCache', () => {
  let cache: TdxClientCache;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    cache = TestBed.inject(TdxClientCache);
  });

  afterEach(() => localStorage.clear());

  it('isCacheable: returns false for realtime endpoints', () => {
    expect(cache.isCacheable('v2/Rail/Metro/LiveBoard/TRTC')).toBe(false);
    expect(cache.isCacheable('v2/Bus/RealTimeByFrequency/City/Taipei')).toBe(false);
    expect(cache.isCacheable('v2/Bike/Availability/Taipei')).toBe(false);
    expect(cache.isCacheable('v3/Rail/TRA/TrainLiveBoard')).toBe(false);
    expect(cache.isCacheable('v2/Bus/EstimatedTimeOfArrival/City/Taipei')).toBe(false);
  });

  it('isCacheable: returns true for static endpoints', () => {
    expect(cache.isCacheable('v2/Rail/Metro/Station/TRTC')).toBe(true);
    expect(cache.isCacheable('v2/Bus/Route/City/Taipei')).toBe(true);
    expect(cache.isCacheable('v2/Bus/Shape/City/Taipei')).toBe(true);
    expect(cache.isCacheable('v2/Bike/Station/Taipei')).toBe(true);
    expect(cache.isCacheable('v2/Rail/THSR/Station')).toBe(true);
  });

  it('round-trips simple objects', () => {
    cache.set('key1', { hello: 'world', n: 42 });
    expect(cache.get('key1')).toEqual({ hello: 'world', n: 42 });
  });

  it('returns null for unknown keys', () => {
    expect(cache.get('does-not-exist')).toBeNull();
  });

  it('returns null and removes the entry once expired', () => {
    cache.set('key2', { v: 1 });
    // Forge an already-expired entry directly so we don't have to wait 24h.
    const stored = localStorage.getItem('tdx-cache-v1:key2');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);
    parsed.expiresAt = Date.now() - 1000;
    localStorage.setItem('tdx-cache-v1:key2', JSON.stringify(parsed));

    expect(cache.get('key2')).toBeNull();
    expect(localStorage.getItem('tdx-cache-v1:key2')).toBeNull();
  });

  it('clear: removes only its own prefixed keys', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    localStorage.setItem('unrelated-key', 'preserved');
    cache.clear();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
    expect(localStorage.getItem('unrelated-key')).toBe('preserved');
  });

  it('handles malformed entries by returning null', () => {
    localStorage.setItem('tdx-cache-v1:malformed', '{ not json');
    expect(cache.get('malformed')).toBeNull();
  });
});
