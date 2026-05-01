import type { TdxLocalizedName } from '../bus/bus-tdx.types';

/** `/v2/Bike/Station/{City}` — static YouBike station metadata. */
export interface TdxBikeStation {
  readonly StationUID: string;
  readonly StationID: string;
  readonly StationName: TdxLocalizedName;
  readonly StationPosition: {
    readonly PositionLat: number;
    readonly PositionLon: number;
  };
  readonly StationAddress?: TdxLocalizedName;
  /** Total parking spaces. */
  readonly BikesCapacity?: number;
  /** 1 = YouBike 1.0, 2 = YouBike 2.0, 3 = mixed */
  readonly ServiceType?: number;
}

/** `/v2/Bike/Availability/{City}` — live counts. */
export interface TdxBikeAvailability {
  readonly StationUID: string;
  readonly StationID: string;
  /** 0 = service down, 1 = normal */
  readonly ServiceStatus: number;
  /** Bikes available to rent right now. */
  readonly AvailableRentBikes: number;
  /** Empty docks available to return a bike. */
  readonly AvailableReturnBikes: number;
  readonly SrcUpdateTime?: string;
}
