<script lang="ts" setup>
const { svg } = defineProps<{ svg: string }>();
const svgHash = computed(() => hash(svg, 24));
const iconUuid = computed(() => `thei-icon-runtime-${svgHash.value}`);

if (import.meta.client) {
  let iconsElement = document.getElementById(
    'thei-icons',
  ) as SVGSVGElement | null;
  if (!iconsElement) {
    const element = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg',
    );
    element.setAttribute('id', 'thei-icons');
    element.style.cssText = 'display:none;position:absolute';
    document.body.appendChild(element);
    iconsElement = element;
  }

  watch(
    iconUuid,
    (uuid) => {
      if (!document.getElementById(uuid)) {
        const viewBox = svg.match(/viewBox="([^"]*)"/)?.[1];
        const symbol = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'symbol',
        );
        symbol.setAttribute('id', uuid);
        if (viewBox) symbol.setAttribute('viewBox', viewBox);
        symbol.innerHTML = svg
          .replace(/<\?xml[^?]*\?>/i, '')
          .replace(/<svg[^>]*>/i, '')
          .replace(/<\/svg>\s*$/i, '');
        iconsElement!.appendChild(symbol);
      }
    },
    { immediate: true },
  );
}
</script>

<template>
  <svg thei-icon thei-icon-runtime width="1em" height="1em" fill="currentColor">
    <use :href="`#${iconUuid}`"></use>
  </svg>
</template>
