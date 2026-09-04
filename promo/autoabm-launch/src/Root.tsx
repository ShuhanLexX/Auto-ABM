import {Composition} from 'remotion'
import {AutoAbmPromo} from './AutoAbmPromo'
import {ProductDemoClosing} from './components/ProductDemoClosing'
import {ProductDemoIntro} from './components/ProductDemoIntro'

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AutoAbmPromo"
        component={AutoAbmPromo}
        durationInFrames={750}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="ProductDemoClosing"
        component={ProductDemoClosing}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="ProductDemoIntro"
        component={ProductDemoIntro}
        durationInFrames={291}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  )
}
