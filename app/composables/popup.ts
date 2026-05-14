import type { TemplateRef } from 'vue';
import { useFloating, type UseFloatingOptions } from '@floating-ui/vue';

export function usePopup(
  containerElement: TemplateRef<HTMLElement>,
  toggleElement: TemplateRef<HTMLElement>,
  popupElement: TemplateRef<HTMLElement>,
  options?: UseFloatingOptions,
) {
  const showDelay = 400;
  const popupVisible = ref(false);
  const showTimeout = ref<ReturnType<typeof setTimeout>>();
  const { floatingStyles: popupStyles } = useFloating(
    containerElement,
    popupElement,
    options,
  );

  function showPopup() {
    showTimeout.value = setTimeout(() => {
      popupVisible.value = true;
    }, showDelay);
  }

  function hidePopup() {
    if (showTimeout.value) {
      clearTimeout(showTimeout.value);
    }

    disableScrollBreaker();
    disableContextMenuBreaker();
    disableOutsideTouchCloser();
    popupVisible.value = false;
  }

  // Prevent context menu from firing on long-press while popup is showing
  const contextMenuBreaker = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };
  function enableContextMenuBreaker() {
    toggleElement.value?.addEventListener('contextmenu', contextMenuBreaker);
  }
  function disableContextMenuBreaker() {
    toggleElement.value?.removeEventListener('contextmenu', contextMenuBreaker);
  }

  // Cancel pending show if user scrolls/resizes before delay elapses
  const scrollBreaker = () => {
    if (showTimeout.value) {
      clearTimeout(showTimeout.value);
    }
  };
  function enableScrollBreaker() {
    addEventListener('scroll', scrollBreaker);
    addEventListener('resize', scrollBreaker);
  }
  function disableScrollBreaker() {
    removeEventListener('scroll', scrollBreaker);
    removeEventListener('resize', scrollBreaker);
  }

  // Hide popup when user taps outside the container
  const outsideTouchCloser = (e: TouchEvent) => {
    if (!popupVisible.value) return;
    const container = containerElement.value;
    if (!container) return;
    const target = e.target as Node | null;
    if (target && container.contains(target)) return;
    hidePopup();
  };
  function enableOutsideTouchCloser() {
    addEventListener('touchstart', outsideTouchCloser, true);
  }
  function disableOutsideTouchCloser() {
    removeEventListener('touchstart', outsideTouchCloser, true);
  }

  // Named handlers so they can be removed in onUnmounted
  const onToggleTouchStart = () => {
    if (popupVisible.value) {
      hidePopup();
    } else {
      enableScrollBreaker();
      enableContextMenuBreaker();
      enableOutsideTouchCloser();
      showPopup();
    }
  };

  const onToggleTouchEnd = () => {
    // If finger lifted before delay, cancel the pending show
    if (showTimeout.value) {
      clearTimeout(showTimeout.value);
    }
  };

  onMounted(() => {
    containerElement.value?.addEventListener('mouseenter', showPopup);
    containerElement.value?.addEventListener('mouseleave', hidePopup);
    toggleElement.value?.addEventListener('touchstart', onToggleTouchStart);
    toggleElement.value?.addEventListener('touchend', onToggleTouchEnd);
  });

  onUnmounted(() => {
    containerElement.value?.removeEventListener('mouseenter', showPopup);
    containerElement.value?.removeEventListener('mouseleave', hidePopup);
    toggleElement.value?.removeEventListener('touchstart', onToggleTouchStart);
    toggleElement.value?.removeEventListener('touchend', onToggleTouchEnd);

    if (showTimeout.value) {
      clearTimeout(showTimeout.value);
    }

    disableScrollBreaker();
    disableContextMenuBreaker();
    disableOutsideTouchCloser();
  });

  return {
    popupVisible,
    popupStyles,
    showPopup,
    hidePopup,
  };
}
