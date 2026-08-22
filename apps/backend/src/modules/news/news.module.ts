// NewsModule backs ARC-NEWS (News Intelligence).
//
// Owns news provider adapters, collection, normalization/deduplication,
// item/source persistence, sentiment analyzer/model adapters, inference
// lifecycle/failures, versioned sentiment results, and
// sentiment-feature queries (see architecture-baseline.md). Empty in
// this slice: composition boundary only, no business logic yet.
import { Module } from "@nestjs/common";

@Module({})
export class NewsModule {}
