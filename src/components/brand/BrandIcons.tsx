/**
 * Official brand marks, used ONLY to identify the provider on its own buttons
 * ("Connect with Steam", "Continue with FACEIT"). Visual only: no behaviour, no
 * endorsement implied. Paths from Simple Icons 15.22.0 (CC0), which mirror the
 * marks published by each brand (Steam: partner.steamgames.com/doc/marketing/branding).
 * Colour follows the button text (`currentColor`); the shapes are never altered.
 */
import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "children">;

const STEAM_PATH =
  "M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z";

const FACEIT_PATH =
  "M23.999 2.705a.167.167 0 00-.312-.1 1141.27 1141.27 0 00-6.053 9.375H.218c-.221 0-.301.282-.11.352 7.227 2.73 17.667 6.836 23.5 9.134.15.06.39-.08.39-.18z";

function BrandSvg({ shape, ...props }: IconProps & { shape: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
      <path d={shape} />
    </svg>
  );
}

export function SteamIcon(props: IconProps) {
  return <BrandSvg data-brand="steam" shape={STEAM_PATH} {...props} />;
}

export function FaceitIcon(props: IconProps) {
  return <BrandSvg data-brand="faceit" shape={FACEIT_PATH} {...props} />;
}
