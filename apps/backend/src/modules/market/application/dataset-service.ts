// Public Market application contract for creating and resolving immutable datasets.

import type { DatasetRef } from "../domain/dataset-ref.js";
import type {
  CreateDatasetRequest,
  DatasetManifest,
  ResolvedDataset
} from "../domain/dataset-manifest.js";

export interface DatasetService {
  createDataset(request: CreateDatasetRequest): Promise<DatasetManifest>;
  resolveDataset(ref: DatasetRef): Promise<ResolvedDataset>;
}
