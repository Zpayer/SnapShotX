/**
 * enums.js
 * Parses C#-style enum definitions into plain JS objects.
 */

/**
 * Converts a C#-style enum string into a { name: value } object.
 * Strips [Attribute(...)] annotations and // line comments.
 * @param {string} input
 * @returns {Record<string, number>}
 */
export function Enum(input) {
    const g = {};
    let c = 0;

    input = input.replace(/\[.*?\]/gs, '');
    input = input.replace(/\/\/.*(?=\n|$)/g, '');
    input = input.replace(/\s+/g, '');

    for (const p of input.split(',')) {
        if (!p) continue;
        if (p.includes('=')) {
            const [key, value] = p.split('=');
            g[key] = JSON.parse(value);
            c = g[key];
        } else {
            g[p] = c;
        }
        c++;
    }

    return g;
}

/** KoGaMa world-object type enum (name → numeric id). */
export const WorldObjectCode = Enum(`
		// Token: 0x04000138 RID: 312
		[Token(Token = "0x4000138")]
		PlayModeAvatar,
		// Token: 0x04000139 RID: 313
		[Token(Token = "0x4000139")]
		CubeModel,
		// Token: 0x0400013A RID: 314
		[Token(Token = "0x400013A")]
		PointLight,
		// Token: 0x0400013B RID: 315
		[Token(Token = "0x400013B")]
		TriggerBox,
		// Token: 0x0400013C RID: 316
		[Token(Token = "0x400013C")]
		Mover,
		// Token: 0x0400013D RID: 317
		[Token(Token = "0x400013D")]
		Path,
		// Token: 0x0400013E RID: 318
		[Token(Token = "0x400013E")]
		PathNode,
		// Token: 0x0400013F RID: 319
		[Token(Token = "0x400013F")]
		SpawnPoint,
		// Token: 0x04000140 RID: 320
		[Token(Token = "0x4000140")]
		CubeModelPrototypeTerrain,
		// Token: 0x04000141 RID: 321
		[Token(Token = "0x4000141")]
		Group,
		// Token: 0x04000142 RID: 322
		[Token(Token = "0x4000142")]
		Action,
		// Token: 0x04000143 RID: 323
		[Token(Token = "0x4000143")]
		BlueprintActivator,
		// Token: 0x04000144 RID: 324
		[Token(Token = "0x4000144")]
		ParticleEmitter,
		// Token: 0x04000145 RID: 325
		[Token(Token = "0x4000145")]
		SoundEmitter,
		// Token: 0x04000146 RID: 326
		[Token(Token = "0x4000146")]
		BlueprintFire,
		// Token: 0x04000147 RID: 327
		[Token(Token = "0x4000147")]
		BlueprintSmoke,
		// Token: 0x04000148 RID: 328
		[Token(Token = "0x4000148")]
		BlueprintExplosion,
		// Token: 0x04000149 RID: 329
		[Token(Token = "0x4000149")]
		Flag,
		// Token: 0x0400014A RID: 330
		[Token(Token = "0x400014A")]
		TestLogicCube,
		// Token: 0x0400014B RID: 331
		[Token(Token = "0x400014B")]
		Battery,
		// Token: 0x0400014C RID: 332
		[Token(Token = "0x400014C")]
		ToggleBox,
		// Token: 0x0400014D RID: 333
		[Token(Token = "0x400014D")]
		Negate,
		// Token: 0x0400014E RID: 334
		[Token(Token = "0x400014E")]
		And,
		// Token: 0x0400014F RID: 335
		[Token(Token = "0x400014F")]
		Explosives,
		// Token: 0x04000150 RID: 336
		[Token(Token = "0x4000150")]
		TextMsg,
		// Token: 0x04000151 RID: 337
		[Token(Token = "0x4000151")]
		Fire,
		// Token: 0x04000152 RID: 338
		[Token(Token = "0x4000152")]
		Smoke,
		// Token: 0x04000153 RID: 339
		[Token(Token = "0x4000153")]
		TimeTrigger,
		// Token: 0x04000154 RID: 340
		[Token(Token = "0x4000154")]
		Teleporter,
		// Token: 0x04000155 RID: 341
		[Token(Token = "0x4000155")]
		Goal,
		// Token: 0x04000156 RID: 342
		[Token(Token = "0x4000156")]
		PickupItemHealthPack,
		// Token: 0x04000157 RID: 343
		[Token(Token = "0x4000157")]
		PickupItemCenterGun,
		// Token: 0x04000158 RID: 344
		[Token(Token = "0x4000158")]
		CubeModelTerrainFineGrained,
		// Token: 0x04000159 RID: 345
		[Token(Token = "0x4000159")]
		PressurePlate,
		// Token: 0x0400015A RID: 346
		[Token(Token = "0x400015A")]
		PickupItemImpulseGun,
		// Token: 0x0400015B RID: 347
		[Token(Token = "0x400015B")]
		PickupItemBazookaGun,
		// Token: 0x0400015C RID: 348
		[Token(Token = "0x400015C")]
		PickupItemRailGun,
		// Token: 0x0400015D RID: 349
		[Token(Token = "0x400015D")]
		PickupItemSpawner,
		// Token: 0x0400015E RID: 350
		[Token(Token = "0x400015E")]
		Skybox,
		// Token: 0x0400015F RID: 351
		[Token(Token = "0x400015F")]
		SpawnPointRed,
		// Token: 0x04000160 RID: 352
		[Token(Token = "0x4000160")]
		SpawnPointGreen,
		// Token: 0x04000161 RID: 353
		[Token(Token = "0x4000161")]
		SpawnPointYellow,
		// Token: 0x04000162 RID: 354
		[Token(Token = "0x4000162")]
		SpawnPointBlue,
		// Token: 0x04000163 RID: 355
		[Token(Token = "0x4000163")]
		ModelToggle,
		// Token: 0x04000164 RID: 356
		[Token(Token = "0x4000164")]
		WaterPlane,
		// Token: 0x04000165 RID: 357
		[Token(Token = "0x4000165")]
		Blueprint,
		// Token: 0x04000166 RID: 358
		[Token(Token = "0x4000166")]
		PulseBox,
		// Token: 0x04000167 RID: 359
		[Token(Token = "0x4000167")]
		RandomBox,
		// Token: 0x04000168 RID: 360
		[Token(Token = "0x4000168")]
		SentryGun,
		// Token: 0x04000169 RID: 361
		[Token(Token = "0x4000169")]
		CollectibleItem,
		// Token: 0x0400016A RID: 362
		[Token(Token = "0x400016A")]
		MovingPlatformNode,
		// Token: 0x0400016B RID: 363
		[Token(Token = "0x400016B")]
		WaterPlanePreset,
		// Token: 0x0400016C RID: 364
		[Token(Token = "0x400016C")]
		LightPreset,
		// Token: 0x0400016D RID: 365
		[Token(Token = "0x400016D")]
		Ghost,
		// Token: 0x0400016E RID: 366
		[Token(Token = "0x400016E")]
		PickupCubeGun,
		// Token: 0x0400016F RID: 367
		[Token(Token = "0x400016F")]
		CheckPoint,
		// Token: 0x04000170 RID: 368
		[Token(Token = "0x4000170")]
		HoverCraft,
		// Token: 0x04000171 RID: 369
		[Token(Token = "0x4000171")]
		WorldObjectSpawnerVehicle,
		// Token: 0x04000172 RID: 370
		[Token(Token = "0x4000172")]
		MonoPlane,
		// Token: 0x04000173 RID: 371
		[Token(Token = "0x4000173")]
		JetPack,
		// Token: 0x04000174 RID: 372
		[Token(Token = "0x4000174")]
		RoundCube,
		// Token: 0x04000175 RID: 373
		[Token(Token = "0x4000175")]
		AdvancedGhost,
		// Token: 0x04000176 RID: 374
		[Token(Token = "0x4000176")]
		HamsterWheel,
		// Token: 0x04000177 RID: 375
		[Token(Token = "0x4000177")]
		KillLimit,
		// Token: 0x04000178 RID: 376
		[Token(Token = "0x4000178")]
		OculusKillLimit,
		// Token: 0x04000179 RID: 377
		[Token(Token = "0x4000179")]
		CountingCube,
		// Token: 0x0400017A RID: 378
		[Token(Token = "0x400017A")]
		VehicleEnergy = 118,
		// Token: 0x0400017B RID: 379
		[Token(Token = "0x400017B")]
		WorldObjectSpawnerVehicleEnergy,
		// Token: 0x0400017C RID: 380
		[Token(Token = "0x400017C")]
		Jakob6,
		// Token: 0x0400017D RID: 381
		[Token(Token = "0x400017D")]
		Jakob7,
		// Token: 0x0400017E RID: 382
		[Token(Token = "0x400017E")]
		Jakob8,
		// Token: 0x0400017F RID: 383
		[Token(Token = "0x400017F")]
		Jakob9,
		// Token: 0x04000180 RID: 384
		[Token(Token = "0x4000180")]
		Jakob10,
		// Token: 0x04000181 RID: 385
		[Token(Token = "0x4000181")]
		Jakob11,
		// Token: 0x04000182 RID: 386
		[Token(Token = "0x4000182")]
		Jakob12,
		// Token: 0x04000183 RID: 387
		[Token(Token = "0x4000183")]
		Jakob13,
		// Token: 0x04000184 RID: 388
		[Token(Token = "0x4000184")]
		Jakob14,
		// Token: 0x04000185 RID: 389
		[Token(Token = "0x4000185")]
		Jakob15,
		// Token: 0x04000186 RID: 390
		[Token(Token = "0x4000186")]
		GamePoint,
		// Token: 0x04000187 RID: 391
		[Token(Token = "0x4000187")]
		GamePassProgressionDataObject,
		// Token: 0x04000188 RID: 392
		[Token(Token = "0x4000188")]
		Christian3,
		// Token: 0x04000189 RID: 393
		[Token(Token = "0x4000189")]
		BuildModeAvatar,
		// Token: 0x0400018A RID: 394
		[Token(Token = "0x400018A")]
		AvatarSpawnRoleCreator,
		// Token: 0x0400018B RID: 395
		[Token(Token = "0x400018B")]
		GameOptionsDataObject,
		// Token: 0x0400018C RID: 396
		[Token(Token = "0x400018C")]
		ModelTransparency,
		// Token: 0x0400018D RID: 397
		[Token(Token = "0x400018D")]
		Christian8,
		// Token: 0x0400018E RID: 398
		[Token(Token = "0x400018E")]
		Christian9,
		// Token: 0x0400018F RID: 399
		[Token(Token = "0x400018F")]
		Christian10,
		// Token: 0x04000190 RID: 400
		[Token(Token = "0x4000190")]
		Christian11,
		// Token: 0x04000191 RID: 401
		[Token(Token = "0x4000191")]
		Christian12,
		// Token: 0x04000192 RID: 402
		[Token(Token = "0x4000192")]
		Christian13,
		// Token: 0x04000193 RID: 403
		[Token(Token = "0x4000193")]
		Christian14,
		// Token: 0x04000194 RID: 404
		[Token(Token = "0x4000194")]
		Christian15,
		// Token: 0x04000195 RID: 405
		[Token(Token = "0x4000195")]
		CameraSettings,
		// Token: 0x04000196 RID: 406
		[Token(Token = "0x4000196")]
		GravityCube,
		// Token: 0x04000197 RID: 407
		[Token(Token = "0x4000197")]
		GameCoin = 148,
		// Token: 0x04000198 RID: 408
		[Token(Token = "0x4000198")]
		GameCoinChest,
		// Token: 0x04000199 RID: 409
		[Token(Token = "0x4000199")]
		Theme,
		// Token: 0x0400019A RID: 410
		[Token(Token = "0x400019A")]
		Door,
		// Token: 0x0400019B RID: 411
		[Token(Token = "0x400019B")]
		BlueprintDoor,
		// Token: 0x0400019C RID: 412
		[Token(Token = "0x400019C")]
		PickupMeleeWeapon,
		// Token: 0x0400019D RID: 413
		[Token(Token = "0x400019D")]
		BlueprintMeleeWeapon,
		// Token: 0x0400019E RID: 414
		[Token(Token = "0x400019E")]
		PickupCostume,
		// Token: 0x0400019F RID: 415
		[Token(Token = "0x400019F")]
		BlueprintCostume,
		// Token: 0x040001A0 RID: 416
		[Token(Token = "0x40001A0")]
		PickupCustomGun,
		// Token: 0x040001A1 RID: 417
		[Token(Token = "0x40001A1")]
		BlueprintCustomGun,
		// Token: 0x040001A2 RID: 418
		[Token(Token = "0x40001A2")]
		Caspar15,
		// Token: 0x040001A3 RID: 419
		[Token(Token = "0x40001A3")]
		ShrinkGun,
		// Token: 0x040001A4 RID: 420
		[Token(Token = "0x40001A4")]
		TeamEditor,
		// Token: 0x040001A5 RID: 421
		[Token(Token = "0x40001A5")]
		TriggerCube,
		// Token: 0x040001A6 RID: 422
		[Token(Token = "0x40001A6")]
		Thomas4,
		// Token: 0x040001A7 RID: 423
		[Token(Token = "0x40001A7")]
		CollectTheItemCollectableInstance,
		// Token: 0x040001A8 RID: 424
		[Token(Token = "0x40001A8")]
		ShootableButton,
		// Token: 0x040001A9 RID: 425
		[Token(Token = "0x40001A9")]
		UseLever,
		// Token: 0x040001AA RID: 426
		[Token(Token = "0x40001AA")]
		CollectTheItemDropOff,
		// Token: 0x040001AB RID: 427
		[Token(Token = "0x40001AB")]
		CollectTheItemCollectable,
		// Token: 0x040001AC RID: 428
		[Token(Token = "0x40001AC")]
		CollectTheItem,
		// Token: 0x040001AD RID: 429
		[Token(Token = "0x40001AD")]
		WindTurbine,
		// Token: 0x040001AE RID: 430
		[Token(Token = "0x40001AE")]
		GlobalSoundEmitter,
		// Token: 0x040001AF RID: 431
		[Token(Token = "0x40001AF")]
		Mathias3,
		// Token: 0x040001B0 RID: 432
		[Token(Token = "0x40001B0")]
		Mathias4,
		// Token: 0x040001B1 RID: 433
		[Token(Token = "0x40001B1")]
		Mathias5,
		// Token: 0x040001B2 RID: 434
		[Token(Token = "0x40001B2")]
		Mathias6,
		// Token: 0x040001B3 RID: 435
		[Token(Token = "0x40001B3")]
		Mathias7,
		// Token: 0x040001B4 RID: 436
		[Token(Token = "0x40001B4")]
		Mathias8,
		// Token: 0x040001B5 RID: 437
		[Token(Token = "0x40001B5")]
		Mathias9,
		// Token: 0x040001B6 RID: 438
		[Token(Token = "0x40001B6")]
		Mathias10,
		// Token: 0x040001B7 RID: 439
		[Token(Token = "0x40001B7")]
		TimeAttackFlag,
		// Token: 0x040001B8 RID: 440
		[Token(Token = "0x40001B8")]
		GamePointChest,
		// Token: 0x040001B9 RID: 441
		[Token(Token = "0x40001B9")]
		Marcus3,
		// Token: 0x040001BA RID: 442
		[Token(Token = "0x40001BA")]
		Marcus4,
		// Token: 0x040001BB RID: 443
		[Token(Token = "0x40001BB")]
		Marcus5,
		// Token: 0x040001BC RID: 444
		[Token(Token = "0x40001BC")]
		Marcus6,
		// Token: 0x040001BD RID: 445
		[Token(Token = "0x40001BD")]
		Marcus7,
		// Token: 0x040001BE RID: 446
		[Token(Token = "0x40001BE")]
		Marcus8,
		// Token: 0x040001BF RID: 447
		[Token(Token = "0x40001BF")]
		Marcus9,
		// Token: 0x040001C0 RID: 448
		[Token(Token = "0x40001C0")]
		Marcus10
`);

/** Reverse map: numeric id → name. */
export const WorldObjectTypes = Object.fromEntries(
    Object.entries(WorldObjectCode).map(([k, v]) => [v, k])
);
