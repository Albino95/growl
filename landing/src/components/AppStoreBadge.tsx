import { APP_STORE_URL } from '@/lib/seo';

const APPLE_LOGO =
  'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701';

/**
 * "Download on the App Store" badge, drawn to Apple's marketing guidelines
 * (black field, 1px grey keyline, Apple logo, two-line lockup).
 */
export default function AppStoreBadge({
  className = 'h-[52px]',
  label = 'Download Grow! on the App Store',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <a
      href={APP_STORE_URL}
      aria-label={label}
      className="inline-flex shrink-0 rounded-[10px] transition-opacity hover:opacity-85"
    >
      <svg viewBox="0 0 120 40" className={`${className} w-auto`} aria-hidden="true">
        <rect x="0.5" y="0.5" width="119" height="39" rx="6.5" fill="#000" stroke="#A6A6A6" />
        <g transform="translate(9 7.6) scale(1.03)" fill="#fff">
          <path d={APPLE_LOGO} />
        </g>
        <text
          x="38"
          y="15.2"
          fill="#fff"
          fontSize="7.6"
          fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
          fontWeight="500"
        >
          Download on the
        </text>
        <text
          x="37.4"
          y="30.6"
          fill="#fff"
          fontSize="15.6"
          fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif"
          fontWeight="600"
          letterSpacing="-0.4"
        >
          App Store
        </text>
      </svg>
    </a>
  );
}
