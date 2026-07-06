// Ambient declarations so `tsc` accepts the Expo template's CSS imports (handled
// at runtime by Metro / react-native-web, invisible to the type checker).
declare module "*.css";
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
