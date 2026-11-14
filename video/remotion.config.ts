import { Config } from "@remotion/cli/config";

// Lossless intermediate frames, then H.264 at CRF 18 in BT.709 so the graphite tones stay true.
Config.setVideoImageFormat("png");
Config.setCodec("h264");
Config.setCrf(18);
Config.setPixelFormat("yuv420p");
Config.setColorSpace("bt709");
Config.setX264Preset("slow");
Config.setAudioBitrate("192k");
Config.setOverwriteOutput(true);
