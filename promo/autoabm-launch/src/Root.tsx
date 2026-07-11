import {Composition} from 'remotion'
import {AutoAbmPromo} from './AutoAbmPromo'

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
    </>
  )
}
