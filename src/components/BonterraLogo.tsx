export function BonterraLogo({ className }: { className?: string }) {
  return (
    <div className={className}>
      <svg
        viewBox="0 0 200 50"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full"
      >
        {/* Bonterra icon circle */}
        <circle cx="25" cy="25" r="20" fill="hsl(var(--primary))" />
        <circle cx="25" cy="25" r="12" fill="hsl(var(--accent))" />
        
        {/* Bonterra text */}
        <text
          x="55"
          y="32"
          fill="hsl(var(--primary))"
          fontSize="24"
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          Bonterra
        </text>
      </svg>
    </div>
  );
}
