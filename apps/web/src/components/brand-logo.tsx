import Image from 'next/image';
import { cn } from '@/lib/cn';

export function BrandLogo({
  size = 40,
  className,
  priority = false,
  decorative = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
  decorative?: boolean;
}) {
  return (
    <Image
      src="/today-course-logo.png"
      width={size}
      height={size}
      sizes={`${size}px`}
      alt={decorative ? '' : '오늘코스 로고'}
      priority={priority}
      className={cn('shrink-0 rounded-[28%] object-cover', className)}
    />
  );
}
