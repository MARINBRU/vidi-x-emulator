import { AttachedExtensionState, ExtensionBusContext, HardwareExtension } from '../types';

/**
 * VIDI X 60-Pin Expansion Bus Extension Registry
 * Provides the plug-and-play hardware extension architecture for attaching
 * external sensor, actuator, display, or communication hats to any VIDI X board.
 */
export class ExtensionRegistry {
  private extensions = new Map<string, HardwareExtension>();

  public register(extension: HardwareExtension): void {
    this.extensions.set(extension.id, extension);
  }

  public unregister(extensionId: string): void {
    this.extensions.delete(extensionId);
  }

  public get(extensionId: string): HardwareExtension | undefined {
    return this.extensions.get(extensionId);
  }

  public listAvailable(): HardwareExtension[] {
    return Array.from(this.extensions.values());
  }

  public notifyAttach(extensionId: string, ctx: ExtensionBusContext): AttachedExtensionState | null {
    const ext = this.extensions.get(extensionId);
    if (!ext) return null;
    ext.onAttach?.(ctx);
    return {
      extensionId: ext.id,
      name: ext.name,
      enabled: true,
      config: {},
    };
  }

  public notifyDetach(extensionId: string, ctx: ExtensionBusContext): void {
    const ext = this.extensions.get(extensionId);
    ext?.onDetach?.(ctx);
  }

  public notifyTick(attached: AttachedExtensionState[], ctx: ExtensionBusContext, deltaMs: number): void {
    for (const item of attached) {
      if (!item.enabled) continue;
      const ext = this.extensions.get(item.extensionId);
      ext?.onTick?.(ctx, deltaMs);
    }
  }

  public notifyPinWrite(
    attached: AttachedExtensionState[],
    ctx: ExtensionBusContext,
    gpio: number,
    digital: 0 | 1,
    analog: number
  ): void {
    for (const item of attached) {
      if (!item.enabled) continue;
      const ext = this.extensions.get(item.extensionId);
      ext?.onPinWrite?.(ctx, gpio, digital, analog);
    }
  }
}

export const globalExtensionRegistry = new ExtensionRegistry();

// Register reference expansion bus modules for testing the 60-pin extension architecture
globalExtensionRegistry.register({
  id: 'ext-uart2-gps-nmea',
  name: 'UART2 GPS NMEA-0183 Receiver Hat',
  version: '1.0.0',
  description: 'Streams simulated $GPGGA GPS coordinates into Expansion UART2 RX (GPIO 16) every 2 seconds.',
  usedGpios: [16, 17],
  onTick: (() => {
    let acc = 0;
    return (ctx, deltaMs) => {
      acc += deltaMs;
      if (acc >= 2000) {
        acc = 0;
        ctx.sendSerialRx(2, '$GPGGA,123519,4519.12,N,01436.45,E,1,08,0.9,15.2,M*47\n');
      }
    };
  })(),
});

globalExtensionRegistry.register({
  id: 'ext-gpio-pulse-gen',
  name: 'GPIO 14 Square-Wave Clock Generator',
  version: '1.0.0',
  description: 'Drives a 1Hz 3.3V square wave clock signal onto Expansion Pin #14 (GPIO 14) for interrupt/logic testing.',
  usedGpios: [14],
  onTick: (() => {
    let acc = 0;
    let level: 0 | 1 = 0;
    return (ctx, deltaMs) => {
      acc += deltaMs;
      if (acc >= 500) {
        acc = 0;
        level = level === 1 ? 0 : 1;
        ctx.writeDigital(14, level);
      }
    };
  })(),
});
