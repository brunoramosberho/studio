"use client";

import { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import {
  Dumbbell, Bike, Flame, Heart, Zap, Timer, Target, Trophy,
  Music, Wind, Waves, Sparkles, Sun, Moon, Star, Mountain,
  Footprints, PersonStanding, Activity, HeartPulse,
  Swords, Shield, Gauge, Hourglass, BarChart3,
  BicepsFlexed, HandMetal, Hand, Grip,
  CircleDot, Disc, Circle, Square, Triangle, Hexagon, Octagon, Diamond,
  Leaf, TreePine, Flower2, Sprout,
  Droplets, CloudRain, Snowflake, Tornado,
  Rocket, Bolt, Crown, Medal, Award, BadgeCheck,
  Drumstick, Apple, Coffee, GlassWater,
  Brain, Eye, Focus, Crosshair,
  StretchHorizontal, Move, ArrowUpFromLine, ArrowBigUp,
  Bath, ShowerHead, TowelRack, Thermometer, ThermometerSnowflake, ThermometerSun,
  Heater, Amphora, HandHeart, Armchair, Stethoscope, Bandage, AirVent, WandSparkles,
  type LucideIcon,
} from "lucide-react";

export interface IconOption {
  id: string;
  label: string;
  icon: LucideIcon;
  tags: string[];
}

const ICON_OPTIONS: IconOption[] = [
  // Fitness & Strength
  { id: "dumbbell", label: "Pesas", icon: Dumbbell, tags: ["gym", "strength", "weight", "fuerza"] },
  { id: "biceps-flexed", label: "Bíceps", icon: BicepsFlexed, tags: ["muscle", "strength", "fuerza", "músculo"] },
  { id: "flame", label: "Llama", icon: Flame, tags: ["fire", "hiit", "cardio", "quemar", "fuego"] },
  { id: "zap", label: "Rayo", icon: Zap, tags: ["energy", "power", "energía", "electric"] },
  { id: "bolt", label: "Bolt", icon: Bolt, tags: ["power", "electric", "energía", "potencia"] },
  { id: "heart-pulse", label: "Cardio", icon: HeartPulse, tags: ["cardio", "heart", "corazón", "pulse"] },
  { id: "activity", label: "Actividad", icon: Activity, tags: ["cardio", "monitor", "ritmo", "actividad"] },
  { id: "gauge", label: "Medidor", icon: Gauge, tags: ["speed", "intensity", "intensidad", "velocidad"] },
  { id: "target", label: "Objetivo", icon: Target, tags: ["goal", "focus", "precision", "objetivo"] },
  { id: "crosshair", label: "Precisión", icon: Crosshair, tags: ["focus", "precision", "enfoque"] },

  // Cycling
  { id: "bike", label: "Bicicleta", icon: Bike, tags: ["cycling", "spin", "bici", "ciclismo", "indoor"] },

  // Mind & Body
  { id: "person-standing", label: "Persona", icon: PersonStanding, tags: ["yoga", "pilates", "body", "cuerpo", "postura"] },
  { id: "wind", label: "Viento", icon: Wind, tags: ["breath", "yoga", "calm", "respiración", "relax"] },
  { id: "brain", label: "Cerebro", icon: Brain, tags: ["mind", "meditation", "mente", "meditación", "mindfulness"] },
  { id: "eye", label: "Ojo", icon: Eye, tags: ["focus", "meditation", "enfoque", "concentración"] },
  { id: "focus", label: "Foco", icon: Focus, tags: ["concentrate", "mindfulness", "enfoque", "zen"] },
  { id: "sun", label: "Sol", icon: Sun, tags: ["morning", "energy", "mañana", "energía", "saludo"] },
  { id: "moon", label: "Luna", icon: Moon, tags: ["night", "relax", "calm", "noche", "relajación"] },
  { id: "leaf", label: "Hoja", icon: Leaf, tags: ["nature", "organic", "yoga", "natural", "verde"] },
  { id: "flower", label: "Flor", icon: Flower2, tags: ["bloom", "yoga", "wellness", "bienestar"] },
  { id: "sprout", label: "Brote", icon: Sprout, tags: ["growth", "beginner", "crecimiento", "principiante"] },
  { id: "sparkles", label: "Destellos", icon: Sparkles, tags: ["magic", "special", "especial", "premium"] },

  // Water & Elements
  { id: "waves", label: "Olas", icon: Waves, tags: ["flow", "water", "surf", "aqua", "flujo"] },
  { id: "droplets", label: "Gotas", icon: Droplets, tags: ["water", "aqua", "sweat", "sudor", "agua"] },
  { id: "snowflake", label: "Copo", icon: Snowflake, tags: ["cold", "cryo", "frío", "cool"] },
  { id: "tornado", label: "Tornado", icon: Tornado, tags: ["spin", "power", "energía", "giro"] },

  // Wellness, spa & hydrotherapy
  { id: "bath", label: "Bañera", icon: Bath, tags: ["bath", "baño", "bañera", "hidro", "jacuzzi", "wellness", "spa"] },
  { id: "shower-head", label: "Ducha", icon: ShowerHead, tags: ["shower", "ducha", "contrast", "escocesa", "wellness", "spa"] },
  { id: "towel-rack", label: "Toallero", icon: TowelRack, tags: ["towel", "toalla", "toallero", "spa", "albornoz", "wellness"] },
  { id: "heater", label: "Calor / sauna", icon: Heater, tags: ["heater", "sauna", "calor", "heat", "wellness", "steam"] },
  { id: "thermometer-sun", label: "Temperatura caliente", icon: ThermometerSun, tags: ["hot", "caliente", "sauna", "calor", "wellness"] },
  { id: "thermometer-snowflake", label: "Temperatura fría", icon: ThermometerSnowflake, tags: ["cold", "frío", "cold plunge", "plunge", "crio", "crioterapia", "wellness"] },
  { id: "thermometer", label: "Termómetro", icon: Thermometer, tags: ["temperature", "temperatura", "contrast", "contraste", "wellness"] },
  { id: "air-vent", label: "Vapor / aire", icon: AirVent, tags: ["steam", "vapor", "steam room", "sauna", "ventilación", "wellness"] },
  { id: "amphora", label: "Ánfora", icon: Amphora, tags: ["amphora", "ánfora", "aceites", "aromaterapia", "spa", "aceite", "ritual"] },
  { id: "hand-heart", label: "Masaje / cuidado", icon: HandHeart, tags: ["massage", "masaje", "touch", "cuidado", "wellness", "terapia"] },
  { id: "wand-sparkles", label: "Tratamiento / ritual", icon: WandSparkles, tags: ["spa", "ritual", "tratamiento", "facial", "belleza", "wellness"] },
  { id: "armchair", label: "Descanso", icon: Armchair, tags: ["lounge", "relax", "descanso", "wellness", "chill"] },
  { id: "stethoscope", label: "Terapia clínica", icon: Stethoscope, tags: ["therapy", "terapia", "physio", "fisio", "fisioterapia", "salud", "wellness"] },
  { id: "bandage", label: "Recuperación", icon: Bandage, tags: ["recovery", "recuperación", "lesión", "rehab", "wellness"] },

  // Combat & Power
  { id: "swords", label: "Espadas", icon: Swords, tags: ["combat", "fight", "combate", "pelea", "box"] },
  { id: "shield", label: "Escudo", icon: Shield, tags: ["defense", "protect", "defensa", "protección"] },
  { id: "hand-metal", label: "Rock", icon: HandMetal, tags: ["rock", "power", "metal", "fuerza"] },
  { id: "hand", label: "Mano", icon: Hand, tags: ["stretch", "barre", "mano", "palma"] },
  { id: "grip", label: "Agarre", icon: Grip, tags: ["grip", "hold", "agarre", "fuerza"] },

  // Music & Dance
  { id: "music", label: "Música", icon: Music, tags: ["dance", "rhythm", "baile", "ritmo", "música"] },

  // Movement
  { id: "footprints", label: "Huellas", icon: Footprints, tags: ["run", "walk", "correr", "caminar", "pasos"] },
  { id: "stretch", label: "Extensión", icon: StretchHorizontal, tags: ["stretch", "flexibility", "estiramiento", "flexibilidad"] },
  { id: "move", label: "Movimiento", icon: Move, tags: ["move", "mobility", "movilidad", "movimiento"] },
  { id: "arrow-up", label: "Elevar", icon: ArrowUpFromLine, tags: ["lift", "elevate", "levantar", "elevar", "subir"] },
  { id: "arrow-big-up", label: "Impulso", icon: ArrowBigUp, tags: ["boost", "up", "impulso", "subir"] },

  // Achievement
  { id: "trophy", label: "Trofeo", icon: Trophy, tags: ["win", "competition", "competencia", "trofeo"] },
  { id: "medal", label: "Medalla", icon: Medal, tags: ["achievement", "logro", "medalla", "premio"] },
  { id: "award", label: "Premio", icon: Award, tags: ["award", "achievement", "premio", "logro"] },
  { id: "crown", label: "Corona", icon: Crown, tags: ["king", "queen", "premium", "corona", "vip"] },
  { id: "badge-check", label: "Verificado", icon: BadgeCheck, tags: ["certified", "check", "verificado"] },
  { id: "star", label: "Estrella", icon: Star, tags: ["star", "favorite", "estrella", "favorito"] },

  // Nature & Outdoor
  { id: "mountain", label: "Montaña", icon: Mountain, tags: ["climb", "outdoor", "montaña", "escalar"] },
  { id: "tree-pine", label: "Pino", icon: TreePine, tags: ["outdoor", "nature", "naturaleza", "exterior"] },
  { id: "rocket", label: "Cohete", icon: Rocket, tags: ["launch", "power", "potencia", "velocidad"] },

  // Health & Nutrition
  { id: "heart", label: "Corazón", icon: Heart, tags: ["health", "love", "salud", "amor"] },
  { id: "apple", label: "Manzana", icon: Apple, tags: ["nutrition", "health", "nutrición", "salud"] },
  { id: "glass-water", label: "Agua", icon: GlassWater, tags: ["water", "hydration", "agua", "hidratación"] },
  { id: "coffee", label: "Café", icon: Coffee, tags: ["energy", "morning", "café", "energía"] },
  { id: "drumstick", label: "Proteína", icon: Drumstick, tags: ["protein", "nutrition", "proteína"] },

  // Time
  { id: "timer", label: "Timer", icon: Timer, tags: ["time", "interval", "tabata", "timer", "tiempo"] },
  { id: "hourglass", label: "Reloj arena", icon: Hourglass, tags: ["time", "duration", "tiempo", "duración"] },

  // Shapes
  { id: "circle-dot", label: "Centro", icon: CircleDot, tags: ["core", "center", "centro", "núcleo"] },
  { id: "disc", label: "Disco", icon: Disc, tags: ["disc", "reformer", "disco"] },
  { id: "circle", label: "Círculo", icon: Circle, tags: ["circle", "mat", "círculo"] },
  { id: "square", label: "Cuadrado", icon: Square, tags: ["square", "box", "cuadrado", "boxing"] },
  { id: "triangle", label: "Triángulo", icon: Triangle, tags: ["triangle", "yoga", "triángulo", "pose"] },
  { id: "hexagon", label: "Hexágono", icon: Hexagon, tags: ["hexagon", "mma", "ring"] },
  { id: "octagon", label: "Octágono", icon: Octagon, tags: ["octagon", "mma", "ring", "ufc"] },
  { id: "diamond", label: "Diamante", icon: Diamond, tags: ["diamond", "premium", "diamante", "exclusivo"] },
  { id: "bar-chart", label: "Barras", icon: BarChart3, tags: ["progress", "stats", "progreso", "estadísticas"] },
];

export function getIconComponent(iconId: string): LucideIcon | null {
  return ICON_OPTIONS.find((o) => o.id === iconId)?.icon ?? null;
}

export function IconPicker({
  value,
  onChange,
  accentColor,
}: {
  value: string | null;
  onChange: (iconId: string | null) => void;
  accentColor?: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return ICON_OPTIONS;
    const q = search.toLowerCase();
    return ICON_OPTIONS.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.tags.some((t) => t.includes(q)),
    );
  }, [search]);

  const handleSelect = useCallback(
    (id: string) => {
      onChange(value === id ? null : id);
    },
    [value, onChange],
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <Input
          className="h-8 pl-8 text-xs"
          placeholder="Buscar icono..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto rounded-lg border bg-background p-1.5">
        {filtered.length === 0 ? (
          <p className="col-span-8 py-4 text-center text-xs text-muted">
            No se encontraron iconos
          </p>
        ) : (
          filtered.map((opt) => {
            const Icon = opt.icon;
            const isSelected = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                title={opt.label}
                onClick={() => handleSelect(opt.id)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md transition-all",
                  isSelected
                    ? "text-white shadow-sm ring-1 ring-offset-1"
                    : "text-foreground/70 hover:bg-muted/50 hover:text-foreground",
                )}
                style={
                  isSelected
                    ? { backgroundColor: accentColor || "#1A2C4E", outlineColor: accentColor || "#1A2C4E" }
                    : undefined
                }
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })
        )}
      </div>
      {value && (
        <p className="text-[11px] text-muted">
          Seleccionado: <span className="font-medium text-foreground">{ICON_OPTIONS.find(o => o.id === value)?.label ?? value}</span>
          {" · "}
          <button type="button" onClick={() => onChange(null)} className="text-destructive hover:underline">
            Quitar
          </button>
        </p>
      )}
    </div>
  );
}
