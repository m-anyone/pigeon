import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  cssVariables: true,
  palette: {
    primary: { main: '#354956', dark: '#263843', contrastText: '#fcfdfe' },
    background: { default: '#eef1f3', paper: '#fcfdfe' },
    text: { primary: '#22313b', secondary: '#52616c' },
    divider: '#d3dce1',
    error: { main: '#923a3c' },
  },
  typography: {
    fontFamily: 'var(--font-family)',
    button: { textTransform: 'none' },
  },
  components: {
    MuiButton: {
      styleOverrides: { root: { whiteSpace: 'nowrap' } },
    },
    MuiOutlinedInput: {
      styleOverrides: { notchedOutline: { borderColor: 'var(--control-border)' } },
    },
    MuiPaper: {
      styleOverrides: { rounded: { borderRadius: 12 } },
    },
  },
});
