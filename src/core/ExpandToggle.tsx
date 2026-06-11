import { motion } from 'framer-motion'
import { ChevronRightIcon } from 'lucide-react'
import { Button } from '../ui/button'

type ExpandToggleProps = {
  expanded: boolean
  onToggle: () => void
}

/** Disclosure chevron for nested parent rows; rotates on expand (spec §19.2). */
export function ExpandToggle({ expanded, onToggle }: ExpandToggleProps) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-6 shrink-0 text-muted-foreground"
      aria-label={expanded ? 'Collapse row' : 'Expand row'}
      aria-expanded={expanded}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <motion.span
        className="flex"
        animate={{ rotate: expanded ? 90 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      >
        <ChevronRightIcon />
      </motion.span>
    </Button>
  )
}
