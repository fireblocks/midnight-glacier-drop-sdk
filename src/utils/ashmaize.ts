import * as wasm from "ashmaize";
import { Logger } from "./logger.js";

export interface AshMaizeConfig {
  nbLoops: number;
  nbInstrs: number;
  pre_size: number;
  mixing_numbers: number;
  rom_size: number;
}

export class AshMaize {
  private readonly logger = new Logger("utils:ashmaize");
  private instance: wasm.AshMaize | null = null;

  constructor(config?: Partial<AshMaizeConfig>) {
    // Config is set in the Rust implementation
  }

  public async init(noPreMine: string): Promise<void> {
    try {
      this.instance = new wasm.AshMaize();
      this.instance.init(noPreMine);
      this.logger.info("AshMaize initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize AshMaize:", error);
      throw error;
    }
  }

  public async hash(preimage: string): Promise<string> {
    if (!this.instance) {
      throw new Error("AshMaize not initialized. Call init() first.");
    }

    try {
      const hash = this.instance.hash(preimage);
      return hash;
    } catch (error) {
      this.logger.error("AshMaize hashing error:", error);
      throw error;
    }
  }
}
