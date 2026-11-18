<script setup lang="ts">
/**
 * Editor de texto con resaltado para archivos .conf de Asterisk (formato ini):
 * [categorías](plantillas), clave = valor, clave => valor, comentarios con ; y directivas #include.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const props = withDefaults(defineProps<{ modelValue: string; readonly?: boolean; minHeight?: string }>(), { readonly: false, minHeight: '28rem' });
const emit = defineEmits<{ 'update:modelValue': [value: string]; save: [] }>();

const asteriskIni = StreamLanguage.define<{ inValue: boolean }>({
  startState: () => ({ inValue: false }),
  token(stream, state) {
    if (stream.sol()) state.inValue = false;
    if (stream.eatSpace()) return null;
    if (!state.inValue) {
      if (stream.match(/^;.*/)) return 'lineComment';
      if (stream.match(/^#(include|exec|tryinclude)\b.*/)) return 'processingInstruction';
      if (stream.match(/^#.*/)) return 'lineComment';
      if (stream.match(/^\[[^\]]*\](\([^)]*\))?/)) return 'heading';
      if (stream.match(/^[^=;\s]+(?=\s*=>?)/)) return 'propertyName';
      if (stream.match(/^=>?/)) {
        state.inValue = true;
        return 'operator';
      }
      stream.next();
      return null;
    }
    if (stream.match(/^;.*/)) return 'lineComment';
    if (stream.match(/^\$\{[^}]*\}/)) return 'variableName';
    if (stream.match(/^[0-9]+(?=[,\s;]|$)/)) return 'number';
    if (stream.match(/^(yes|no|true|false)(?=[,\s;]|$)/i)) return 'bool';
    stream.next();
    return 'string';
  },
  languageData: { commentTokens: { line: ';' } },
});

const highlight = HighlightStyle.define([
  { tag: t.heading, color: 'var(--primary)', fontWeight: '600' },
  { tag: t.propertyName, color: 'var(--foreground)' },
  { tag: t.operator, color: 'var(--muted-foreground)' },
  { tag: t.string, color: 'oklch(0.55 0.1 50)' },
  { tag: t.number, color: 'oklch(0.55 0.15 280)' },
  { tag: t.bool, color: 'oklch(0.55 0.15 280)' },
  { tag: t.variableName, color: 'oklch(0.6 0.15 230)' },
  { tag: t.lineComment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: t.processingInstruction, color: 'oklch(0.6 0.15 300)', fontWeight: '600' },
]);

const theme = EditorView.theme({
  '&': { fontSize: '12.5px', backgroundColor: 'var(--card)', color: 'var(--foreground)', borderRadius: 'var(--radius-xl)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.55' },
  '.cm-content': { padding: '0.75rem 0', caretColor: 'var(--primary)' },
  '.cm-gutters': { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)', border: 'none', borderRight: '1px solid var(--border)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklch, var(--primary) 7%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'color-mix(in oklch, var(--primary) 12%, transparent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in oklch, var(--primary) 25%, transparent) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--primary)' },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in oklch, var(--primary) 20%, transparent)' },
});

const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
const readonlyCompartment = new Compartment();

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        bracketMatching(),
        asteriskIni,
        syntaxHighlighting(highlight),
        EditorView.lineWrapping,
        theme,
        readonlyCompartment.of(EditorState.readOnly.of(props.readonly)),
        keymap.of([
          { key: 'Mod-s', run: () => (emit('save'), true) },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) emit('update:modelValue', u.state.doc.toString());
        }),
      ],
    }),
  });
});

watch(
  () => props.modelValue,
  (v) => {
    if (view && v !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } });
    }
  },
);
watch(
  () => props.readonly,
  (ro) => view?.dispatch({ effects: readonlyCompartment.reconfigure(EditorState.readOnly.of(ro)) }),
);
onBeforeUnmount(() => view?.destroy());
</script>

<template>
  <div ref="host" class="overflow-hidden rounded-xl border bg-card [&_.cm-editor]:min-h-(--min-h)" :style="{ '--min-h': minHeight }" />
</template>
