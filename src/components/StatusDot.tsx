import { motion, useReducedMotion } from "framer-motion";

/**
 * Pastille de statut.
 *
 * Le changement d'état produit une brève détente : c'est le mouvement, et non
 * une couleur supplémentaire, qui signale la transition. La clé porte le statut,
 * ce qui remonte l'élément et rejoue l'animation ; sur une pastille de sept
 * pixels le coût est nul.
 */
export function StatusDot({ status }: { status?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.span
      className="dot"
      data-status={status}
      key={status ?? "none"}
      initial={reduceMotion ? false : { scale: 0.5 }}
      animate={{ scale: 1 }}
      transition={
        reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 620, damping: 20, mass: 0.5 }
      }
    />
  );
}
