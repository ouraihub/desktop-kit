import type { CargoProject } from './cargo.mjs';
import type { KitConfig } from './config.mjs';
/**
 * The app version must be identical in package.json, the Tauri crate and (unless forbidden)
 * tauri.conf.json; a release tag must be exactly `<tagPrefix><version>`.
 */
export declare class VersionCheck {
    private readonly config;
    private readonly cargo;
    constructor(config: KitConfig, cargo: Pick<CargoProject, 'version'>);
    /** Returns the single agreed version. */
    verify(tag?: string): string;
}
